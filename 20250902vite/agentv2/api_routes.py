# api_routes.py - All HTTP API endpoints for ChainTrace Agent

import logging
import json
import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from typing import Dict, List, Any, Optional

from sqlalchemy.orm import Session
from netmiko import ConnectHandler, NetmikoBaseException # type: ignore
from jose import JWTError, jwt as jose_jwt

from services import (
    is_simulation_mode,
    get_device_info,
    perform_add_block,
    get_running_config,
    perform_rollback,
    perform_pre_deployment_check,
    perform_ai_command_generation,
    perform_ai_config_check,
    check_command_against_rules,
    perform_write_startup
)
import crud
import models
from database import get_db
from core import (
    config as app_config, ACTIVE_WEB_SESSIONS, sessions_lock,
    DevicePayload, ConfigPayload, SubmissionPayload, AuditTriggerPayload, SessionPayload,
    UserUpdatePayload, ConfigTemplate as TemplatePayload, BulkDeployPayload, Policy as PolicyPayload, AISettingsPayload,
    RollbackPayload, BlockDict, AICommandGenerationRequest, AIConfigCheckRequest, WriteStartupPayload,
    JWT_SECRET_KEY, JWT_ALGORITHM, verify_password, create_access_token, LoginPayload,
    ScriptPayload, ScriptExecutePayload, ScheduledTaskPayload,
)
from jinja2 import Environment, BaseLoader, TemplateError as Jinja2TemplateError

_jinja_env = Environment(loader=BaseLoader(), autoescape=False)

router = APIRouter()

# --- Login Rate Limiter ---
_login_attempts: Dict[str, list] = defaultdict(list)
_RATE_LIMIT_MAX: int = 5
_RATE_LIMIT_WINDOW: int = 60  # seconds

def _check_login_rate_limit(ip: str) -> bool:
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= _RATE_LIMIT_MAX:
        return False
    _login_attempts[ip].append(now)
    return True

# --- JWT Helpers ---
def _extract_actor_from_jwt(authorization: str, db: Session) -> str:
    """从 Authorization: Bearer <token> 验证 JWT，返回 username。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="认证失败：请在请求头中提供 Bearer 令牌。")
    token = authorization[7:]
    try:
        payload = jose_jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub", "")
        if not username:
            raise JWTError("missing sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="认证失败：令牌无效或已过期，请重新登录。")
    if not crud.get_user_by_username(db, username):
        raise HTTPException(status_code=401, detail="认证失败：用户不存在。")
    return username

def get_current_actor(
    authorization: str = Header(..., alias="Authorization"),
    db: Session = Depends(get_db)
) -> str:
    """通用 JWT 认证依赖（无权限要求，仅验证身份）。"""
    return _extract_actor_from_jwt(authorization, db)

# --- Granular Authorization Dependency ---
def require_permission(required_permission: str):
    """
    Dependency factory for requiring specific atomic permissions.
    - Validates JWT from Authorization header.
    - Admins are always granted access.
    - Operators are checked for the specific permission in their 'extra_permissions' field.
    """
    def dependency(
        authorization: str = Header(..., alias="Authorization"),
        db: Session = Depends(get_db)
    ) -> str:
        actor = _extract_actor_from_jwt(authorization, db)
        user = crud.get_user_by_username(db, actor)
        if not user:
            raise HTTPException(status_code=401, detail="认证失败：用户不存在。")
        if user.role == "admin":
            return actor
        user_permissions = set((user.extra_permissions or "").split(','))
        if required_permission not in user_permissions:
            logging.warning(f"Authorization failed for operator '{actor}'. Required permission '{required_permission}' not found.")
            raise HTTPException(status_code=403, detail=f"权限不足：需要 '{required_permission}' 权限。")
        return actor
    return Depends(dependency)

# --- API Endpoints ---

@router.post("/api/login")
def login_endpoint(payload: LoginPayload, request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """登录接口：验证用户名和密码，返回 JWT 访问令牌。"""
    ip = request.client.host if request.client else "unknown"
    if not _check_login_rate_limit(ip):
        logging.warning(f"Rate limit exceeded for login from IP: {ip}")
        raise HTTPException(status_code=429, detail="登录尝试过于频繁，请 60 秒后再试。")
    user = crud.get_user_by_username(db, payload.username)
    if not user or not verify_password(payload.password, str(user.password)):
        logging.warning(f"Failed login attempt for username: '{payload.username}' from IP: {ip}")
        raise HTTPException(status_code=401, detail="用户名或密码无效。")
    token = create_access_token(user.username)
    logging.info(f"User '{user.username}' logged in successfully from IP: {ip}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "extra_permissions": user.extra_permissions,
        }
    }

@router.get("/api/data")
def get_all_data(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, Any]:
    # The CRUD function now returns the data in the frontend-expected format
    data = crud.get_all_data(db)
    
    # Enrich device data with netmiko type from config.ini
    enriched_devices: List[Dict[str, Any]] = []
    for device_dict in data.get('devices', []):
        device_id_upper = device_dict.get('id', '').upper()
        netmiko_type: Optional[str] = None
        if app_config.has_option('device_map', device_id_upper):
            try:
                # Use .get with a fallback to avoid errors on malformed entries
                parts = app_config.get('device_map', device_id_upper, fallback='').split(',')
                if len(parts) >= 2:
                    netmiko_type = parts[1].strip()
            except Exception:
                logging.warning(f"Could not parse netmiko type for {device_id_upper} from config.ini")
        
        enriched_device = device_dict.copy()
        enriched_device['netmiko_device_type'] = netmiko_type
        enriched_devices.append(enriched_device)
    
    data['devices'] = enriched_devices
    return data

@router.post("/api/reset", status_code=204)
def reset_data(actor: str = require_permission("system:reset"), db: Session = Depends(get_db)) -> None:
    crud.log_action(db, actor, "重置了所有应用数据到初始状态。")
    crud.reset_all_data(db)
    return

@router.post("/api/devices", status_code=201)
def add_device(device: DevicePayload, actor: str = require_permission("device:create"), db: Session = Depends(get_db)) -> DevicePayload:
    db_device = crud.get_device(db, device_id=device.id)
    if db_device:
        raise HTTPException(status_code=409, detail=f"设备 ID '{device.id}' 已存在。")
    
    new_device_orm = crud.create_device_with_genesis_block(db=db, device_payload=device)
    crud.log_action(db, actor, f"添加了新设备 '{device.name}' (ID: {device.id})。")
    
    # Return payload with policyIds included.
    device.policyIds = [p.id for p in new_device_orm.policies]
    return device

@router.put("/api/devices/{device_id}")
def update_device(device_id: str, device: DevicePayload, actor: str = require_permission("device:update"), db: Session = Depends(get_db)) -> DevicePayload:
    updated_device_orm = crud.update_device(db, device_id, device)
    if not updated_device_orm:
        raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}'。")
    
    crud.log_action(db, actor, f"更新了设备 '{device.name}' (ID: {device_id}) 的信息。")
    
    updated_payload = DevicePayload(
        id=updated_device_orm.id,
        name=updated_device_orm.name,
        ipAddress=updated_device_orm.ipAddress,
        type=updated_device_orm.type,
        policyIds=[p.id for p in updated_device_orm.policies],
        tags=[t.strip() for t in updated_device_orm.tags.split(',') if t.strip()] if updated_device_orm.tags else []
    )
    return updated_payload


@router.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str, actor: str = require_permission("device:delete"), db: Session = Depends(get_db)) -> None:
    device_to_delete = crud.get_device(db, device_id)
    if not device_to_delete:
        raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}'。")
    
    device_name = device_to_delete.name
    if crud.delete_device(db, device_id):
        crud.log_action(db, actor, f"删除了设备 '{device_name}' (ID: {device_id})。")
    return

@router.post("/api/sessions/{device_id}/save", status_code=200)
def save_session_and_audit(device_id: str, payload: AuditTriggerPayload, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> BlockDict:
    """Fetches the latest config from the device and creates a new block."""
    if is_simulation_mode():
        raise HTTPException(status_code=400, detail="模拟模式下无法保存会话。")
    
    # --- RACE CONDITION FIX ---
    # Immediately mark the session as clean to prevent auto-audit on disconnect.
    if payload.sessionId:
        with sessions_lock:
            if payload.sessionId in ACTIVE_WEB_SESSIONS:
                ACTIVE_WEB_SESSIONS[payload.sessionId]['is_dirty'] = False
                logging.info(f"Session {payload.sessionId} for device {device_id} marked as CLEAN due to explicit save.")

    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 ID '{device_id}'。")

    try:
        latest_config_dict = get_running_config(device_id)
        latest_config = latest_config_dict["config"]
        audit_payload = SubmissionPayload(operator=actor, config=latest_config)
        
        new_block = perform_add_block(db, device_id, audit_payload)
        crud.log_action(db, actor, f"通过交互式会话为设备 '{device_id}' 保存并审计了新配置 (版本 {new_block['data']['version']})。")
        
        return new_block

    except NetmikoBaseException as e:
        logging.error(f"Netmiko error during session save for {device_id}: {e}")
        raise HTTPException(status_code=504, detail="从设备获取配置失败：设备响应超时或返回格式不正确。请检查设备状态和网络连接。")
    except Exception as e:
        logging.error(f"Unexpected error during session save for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"保存在线会话时发生意外错误: {e}")

@router.post("/api/devices/{device_id}/write-startup", status_code=200)
def write_startup(device_id: str, payload: WriteStartupPayload, actor: str = require_permission("startup:write"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if is_simulation_mode():
        logging.info(f"SIMULATION MODE: Simulating write startup for {device_id}.")
        return {"status": "success", "message": "写入启动配置模拟成功。"}

    try:
        result = perform_write_startup(db, device_id, payload.token, actor)
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Unexpected error during write startup for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"写入启动配置时发生意外错误: {e}")

@router.post("/api/write-tokens", status_code=201)
def generate_write_token(actor: str = require_permission("user:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Only admins can create tokens, so the permission check for user:manage is sufficient.
    token = crud.create_write_token(db, actor)
    crud.log_action(db, actor, "生成了一个新的一次性写入启动配置令牌。")
    return {
        "id": token.id,
        "token_value": token.token_value,
        "created_by_admin": token.created_by_admin,
        "created_at": token.created_at.isoformat().replace('+00:00', 'Z'),
        "expires_at": token.expires_at.isoformat().replace('+00:00', 'Z'),
        "is_used": token.is_used
    }


@router.post("/api/device/{device_id}/push_config", status_code=200)
def push_config_to_device(device_id: str, payload: ConfigPayload, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if is_simulation_mode():
        logging.info(f"SIMULATION MODE: Simulating config push for {device_id}.")
        return {"status": "success", "message": "配置推送模拟成功。"}
    
    # --- SECURITY FIX: Command Interception ---
    config_commands = payload.config.splitlines()
    for command in config_commands:
        violated_rule = check_command_against_rules(command)
        if violated_rule:
            raise HTTPException(status_code=400, detail=f"配置内容违反了实时拦截策略: '{violated_rule}' (命令: '{command}')")

    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 ID '{device_id}'。")
    
    if not config_commands:
        raise HTTPException(status_code=400, detail="配置内容不能为空。")
    
    try:
        with ConnectHandler(**device_info) as net_connect:
            net_connect.enable()
            output: str = net_connect.send_config_set(config_commands)
        
        crud.log_action(db, actor, f"将配置非交互式地推送到设备 '{device_id}'。")
        return {"status": "success", "output": output}
    except NetmikoBaseException as e:
        logging.error(f"Netmiko error during config push for {device_id}: {e}")
        raise HTTPException(status_code=504, detail="推送配置失败：连接设备时出错。请检查设备状态和网络连接。")
    except Exception as e:
        logging.error(f"Unexpected error during config push for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"推送配置时发生意外错误: {e}")

@router.get("/api/device/{device_id}/running-config")
def get_device_running_config_endpoint(device_id: str, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, str]:
    if is_simulation_mode():
        db_device = crud.get_device_with_details(db, device_id)
        if not db_device or not db_device.blocks:
            raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}' 的区块链。")
        latest_block_data = json.loads(db_device.blocks[-1].data)
        return {"config": latest_block_data.get("config", "")}

    try:
        return get_running_config(device_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Unexpected error getting running-config for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"获取设备配置时发生意外错误: {e}")

# --- NEW AI PROXY ENDPOINTS ---
@router.post("/api/ai/generate-command")
def proxy_ai_generate_command(payload: AICommandGenerationRequest, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, str]:
    try:
        commands = perform_ai_command_generation(payload, db)
        crud.log_action(db, actor, f"为设备 '{payload.device.get('id', 'N/A')}' 使用AI生成了命令。")
        return {"commands": commands}
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error in AI command generation proxy: {e}")
        raise HTTPException(status_code=500, detail=f"AI命令生成时发生意外错误: {e}")

@router.post("/api/ai/check-config")
def proxy_ai_check_config(payload: AIConfigCheckRequest, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, str]:
    try:
        report = perform_ai_config_check(payload)
        crud.log_action(db, actor, f"为设备 '{payload.device.get('id', 'N/A')}' 执行了AI配置体检。")
        return {"report": report}
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error in AI config check proxy: {e}")
        raise HTTPException(status_code=500, detail=f"AI配置体检时发生意外错误: {e}")

@router.post("/api/bulk-deploy")
def bulk_deploy_template(payload: BulkDeployPayload, actor: str = require_permission("template:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    template = crud.get_template(db, payload.template_id)
    if not template: raise HTTPException(status_code=404, detail="未找到模板。")
    
    success_count = 0
    failures: List[str] = []
    results: List[Dict[str, Any]] = []

    for device_id in payload.device_ids:
        device_name_for_logs = "Unknown"
        try:
            device = crud.get_device(db, device_id)
            if not device:
                raise Exception("在数据库中未找到设备元数据。")
            device_name_for_logs = device.name

            try:
                _tmpl = _jinja_env.from_string(str(template.content))
                rendered_config = _tmpl.render(device={
                    "name": device.name,
                    "id": device.id,
                    "ipAddress": device.ipAddress,
                    "type": device.type,
                })
            except Jinja2TemplateError as jinja_err:
                raise Exception(f"Jinja2 模板渲染失败: {jinja_err}")
            
            # --- SECURITY FIX: Command Interception ---
            for command in rendered_config.splitlines():
                violated_rule = check_command_against_rules(command)
                if violated_rule:
                    raise HTTPException(status_code=400, detail=f"模板内容违反了实时拦截策略: '{violated_rule}' (命令: '{command}')")

            # STEP 1: Perform pre-flight compliance check. This will raise HTTPException on failure.
            perform_pre_deployment_check(db, device_id, rendered_config)
            
            # STEP 2: If check passes, push the configuration to the device.
            if not is_simulation_mode():
                device_info_dict = get_device_info(device_id)
                if not device_info_dict: 
                    raise Exception("在 config.ini 中未找到设备。")
                with ConnectHandler(**device_info_dict) as net_connect:
                    net_connect.enable()
                    net_connect.send_config_set(rendered_config.splitlines())
            
            # STEP 3: If push is successful, get the REAL running config to ensure what's stored is canonical.
            final_config = rendered_config
            if not is_simulation_mode():
                final_config_dict = get_running_config(device_id)
                final_config = final_config_dict["config"]

            # STEP 4: Add the block, skipping the now-redundant compliance check.
            audit_payload = SubmissionPayload(operator=actor, config=final_config)
            new_block = perform_add_block(db, device_id, audit_payload, skip_compliance_check=True)
            
            # If we reach here, everything was successful for this device.
            crud.log_action(db, actor, f"通过批量部署模板 '{template.name}' 更新了设备 '{device_id}' (版本 {new_block['data']['version']})。")
            success_count += 1
            results.append({"device_id": device_id, "device_name": device.name, "status": "success", "message": f"部署成功，新版本为 {new_block['data']['version']}。"})
            
        except HTTPException as e:
            logging.warning(f"Deployment failed for {device_id} due to HTTP Exception: {e.detail}")
            failures.append(f"{device_id} ({device_name_for_logs}): {e.status_code}: {e.detail}")
            results.append({"device_id": device_id, "device_name": device_name_for_logs, "status": "failure", "message": f"{e.status_code}: {e.detail}"})
        except Exception as e:
            logging.error(f"Deployment failed for {device_id} due to generic Exception: {e}")
            failures.append(f"{device_id} ({device_name_for_logs}): {e}")
            results.append({"device_id": device_id, "device_name": device_name_for_logs, "status": "failure", "message": str(e)})

    crud.create_deployment_record(db, actor, template.name, payload.device_ids, results)
    
    message = f"部署完成。{success_count} 台成功，{len(failures)} 台失败。"
    return {"message": message, "success_count": success_count, "failures": failures}


@router.post("/api/templates", status_code=201)
def create_template(template: TemplatePayload, actor: str = require_permission("template:manage"), db: Session = Depends(get_db)) -> TemplatePayload:
    if crud.get_template_by_name(db, template.name):
        raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")
    crud.create_template(db, template)
    crud.log_action(db, actor, f"创建了新配置模板 '{template.name}'。")
    return template

@router.put("/api/templates/{template_id}")
def update_template(template_id: str, template: TemplatePayload, actor: str = require_permission("template:manage"), db: Session = Depends(get_db)) -> TemplatePayload:
    db_template = crud.get_template(db, template_id)
    if not db_template:
        raise HTTPException(status_code=404, detail="未找到模板。")
    if db_template.name != template.name and crud.get_template_by_name(db, template.name):
        raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")
    crud.update_template(db, template_id, template)
    crud.log_action(db, actor, f"更新了配置模板 '{template.name}'。")
    return template

@router.delete("/api/templates/{template_id}", status_code=204)
def delete_template(template_id: str, actor: str = require_permission("template:manage"), db: Session = Depends(get_db)) -> None:
    template = crud.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="未找到模板。")
    crud.delete_template(db, template_id)
    crud.log_action(db, actor, f"删除了配置模板 '{template.name}'。")
    return

@router.post("/api/policies", status_code=201)
def create_policy(policy: PolicyPayload, actor: str = require_permission("policy:manage"), db: Session = Depends(get_db)) -> PolicyPayload:
    if crud.get_policy_by_name(db, policy.name):
        raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")
    crud.create_policy(db, policy)
    crud.log_action(db, actor, f"创建了新合规策略 '{policy.name}'。")
    return policy

@router.put("/api/policies/{policy_id}")
def update_policy(policy_id: str, policy: PolicyPayload, actor: str = require_permission("policy:manage"), db: Session = Depends(get_db)) -> PolicyPayload:
    db_policy = crud.get_policy(db, policy_id)
    if not db_policy:
        raise HTTPException(status_code=404, detail="未找到策略。")
    if db_policy.name != policy.name and crud.get_policy_by_name(db, policy.name):
        raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")
    crud.update_policy(db, policy_id, policy)
    crud.log_action(db, actor, f"更新了合规策略 '{policy.name}'。")
    return policy

@router.delete("/api/policies/{policy_id}", status_code=204)
def delete_policy(policy_id: str, actor: str = require_permission("policy:manage"), db: Session = Depends(get_db)) -> None:
    policy = crud.get_policy(db, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="未找到策略。")
    crud.delete_policy(db, policy_id)
    crud.log_action(db, actor, f"删除了合规策略 '{policy.name}'。")
    return

@router.put("/api/settings/ai")
def update_ai_settings(payload: AISettingsPayload, actor: str = require_permission("system:settings"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    crud.update_setting(db, "is_ai_analysis_enabled", str(payload.is_ai_analysis_enabled))
    action = "启用" if payload.is_ai_analysis_enabled else "禁用"
    crud.log_action(db, actor, f"全局 {action} 了后端AI智能分析功能。")
    
    if payload.auto_audit_ai_analysis_mode:
        crud.update_setting(db, "auto_audit_ai_analysis_mode", payload.auto_audit_ai_analysis_mode)
        mode_text = "“尽力而为”" if payload.auto_audit_ai_analysis_mode == 'best_effort' else "“完全禁用”"
        crud.log_action(db, actor, f"将“断连自动审计”的AI分析模式设置为 {mode_text}。")

    return crud.get_settings_as_dict(db)

@router.post("/api/blockchains/{device_id}", status_code=201)
def add_block(device_id: str, payload: SubmissionPayload, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> BlockDict:
    payload.operator = actor  # Always use JWT-authenticated username, not client-provided value
    new_block = perform_add_block(db, device_id, payload)
    crud.log_action(db, actor, f"为设备 '{device_id}' 添加了新配置 (版本 {new_block['data']['version']})。")
    return new_block

@router.post("/api/blockchains/{device_id}/rollback", status_code=201)
def rollback_to_version(device_id: str, payload: RollbackPayload, actor: str = require_permission("rollback:execute"), db: Session = Depends(get_db)) -> BlockDict:
    payload.operator = actor
    new_block = perform_rollback(db, device_id, payload)
    crud.log_action(db, actor, f"将设备 '{device_id}' 回滚至版本 {payload.target_version} (新版本为 {new_block['data']['version']})。")
    return new_block

@router.get("/api/health")
def health_check() -> Dict[str, str]: return {"status": "ok", "mode": "simulation" if is_simulation_mode() else "live"}

@router.get("/api/users")
def get_users(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    users = crud.get_users(db)
    return [{"id": u.id, "username": u.username, "role": u.role, "extra_permissions": u.extra_permissions} for u in users]

@router.post("/api/users", status_code=201)
def create_user(user_payload: UserUpdatePayload, actor: str = require_permission("user:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if crud.get_user_by_username(db, user_payload.username):
        raise HTTPException(status_code=409, detail="用户名已存在。")
    if not user_payload.password:
        raise HTTPException(status_code=400, detail="新用户必须设置密码。")

    new_user = crud.create_user(db, user_payload)
    crud.log_action(db, actor, f"创建了新用户 '{new_user.username}'，角色为 '{new_user.role}'。")
    return {"id": new_user.id, "username": new_user.username, "role": new_user.role, "extra_permissions": new_user.extra_permissions}

@router.put("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdatePayload, actor: str = require_permission("user:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    user_to_update = crud.get_user(db, user_id)
    if not user_to_update:
        raise HTTPException(status_code=404, detail="未找到用户。")
    
    if payload.username != user_to_update.username and crud.get_user_by_username(db, payload.username):
        raise HTTPException(status_code=409, detail="用户名已存在。")
        
    updated_user = crud.update_user(db, user_id, payload)
    log_message = f"更新了用户 '{payload.username}' (ID: {user_id}) 的信息。"
    if payload.password: log_message += " 密码已重置。"
    crud.log_action(db, actor, log_message)
    return {"id": updated_user.id, "username": updated_user.username, "role": updated_user.role, "extra_permissions": updated_user.extra_permissions}

@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, actor: str = require_permission("user:manage"), db: Session = Depends(get_db)) -> None:
    user_to_delete = crud.get_user(db, user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="未找到用户。")
    if user_to_delete.username == actor:
        raise HTTPException(status_code=400, detail="不能删除自己的账户。")
    
    username = user_to_delete.username
    crud.delete_user(db, user_id)
    crud.log_action(db, actor, f"删除了用户 '{username}' (ID: {user_id})。")
    return

# --- SESSION HANDLING REWRITE ---
SESSION_TIMEOUT_SECONDS = 10 # A session is stale if not updated in 10 seconds.

@router.get("/api/sessions/{device_id}")
def get_device_sessions(device_id: str) -> List[Dict[str, str]]:
    """
    Returns a list of active users for a specific device.
    This now iterates through the global session dict, which is keyed by session_id.
    """
    active_users_for_device: List[Dict[str, str]] = []
    now = time.time()
    stale_sessions = []
    with sessions_lock:
        for session_id, session_data in ACTIVE_WEB_SESSIONS.items():
            if (now - session_data['timestamp']) > SESSION_TIMEOUT_SECONDS:
                stale_sessions.append(session_id)
                continue
            if session_data['device_id'] == device_id:
                active_users_for_device.append({
                    'username': session_data['username'],
                    'sessionId': session_id
                })
        # Clean up stale sessions
        for session_id in stale_sessions:
            del ACTIVE_WEB_SESSIONS[session_id]
            
    return active_users_for_device

@router.post("/api/sessions/{device_id}", status_code=204)
def join_device_session(device_id: str, payload: SessionPayload, actor: str = Depends(get_current_actor)) -> None:
    """
    Acts as a heartbeat endpoint to keep a user's session alive for the 'who is viewing' feature.
    This now correctly updates the session in the global dict keyed by session_id.
    """
    with sessions_lock:
        # Update existing session or create a new one if it doesn't exist (e.g., after agent restart)
        ACTIVE_WEB_SESSIONS[payload.sessionId] = {
            'username': payload.username,
            'sessionId': payload.sessionId, # For consistency in the dict, though redundant with the key
            'device_id': device_id,
            'timestamp': time.time(),
            'is_dirty': ACTIVE_WEB_SESSIONS.get(payload.sessionId, {}).get('is_dirty', False)
        }
    return

@router.delete("/api/sessions/{device_id}/{session_id}", status_code=204)
def leave_device_session_endpoint(device_id: str, session_id: str, actor: str = Depends(get_current_actor)) -> None:
    """
    Removes a user's session when they navigate away.
    This correctly removes the session by its unique ID.
    """
    with sessions_lock:
        if session_id in ACTIVE_WEB_SESSIONS:
            # We don't need to check device_id here, session_id is unique enough.
            del ACTIVE_WEB_SESSIONS[session_id]
    return

# --- Feature: Device Status Polling ---
@router.get("/api/devices/poll-status")
async def poll_all_device_statuses(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)):
    """并发检测所有设备的 TCP 22 端口连通性。模拟模式下返回随机数据。"""
    import asyncio, datetime as _dt, time as _time, random as _random
    from datetime import timezone as _tz

    devices = db.query(models.Device).all()

    if is_simulation_mode():
        return {
            d.id: {
                "is_online": _random.random() > 0.15,
                "latency_ms": _random.randint(1, 80) if _random.random() > 0.15 else None,
                "last_checked": _dt.datetime.now(_tz.utc).isoformat().replace('+00:00', 'Z')
            } for d in devices
        }

    async def check_device(device_id: str, ip: str):
        start = _time.monotonic()
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(ip, 22), timeout=3.0)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            latency = int((_time.monotonic() - start) * 1000)
            return device_id, {"is_online": True, "latency_ms": latency, "last_checked": _dt.datetime.now(_tz.utc).isoformat().replace('+00:00', 'Z')}
        except Exception:
            return device_id, {"is_online": False, "latency_ms": None, "last_checked": _dt.datetime.now(_tz.utc).isoformat().replace('+00:00', 'Z')}

    results = await asyncio.gather(*[check_device(d.id, str(d.ipAddress)) for d in devices])
    return dict(results)

# --- Feature: Device History Export & Full Backup ---
@router.get("/api/devices/{device_id}/export")
def export_device_history(device_id: str, actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """导出指定设备的完整配置历史（含所有区块）为 JSON。"""
    from datetime import datetime as _dtcls, timezone as _tz
    device = crud.get_device_with_details(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"设备 '{device_id}' 不存在。")
    blocks = [
        {"index": b.index, "timestamp": b.timestamp, "hash": b.hash,
         "prev_hash": b.prev_hash, "data": json.loads(str(b.data))}
        for b in sorted(device.blocks, key=lambda b: b.index)
    ]
    export_data: Dict[str, Any] = {
        "exported_at": _dtcls.now(_tz.utc).isoformat().replace('+00:00', 'Z'),
        "exported_by": actor,
        "device": {"id": device.id, "name": device.name, "ipAddress": device.ipAddress, "type": device.type},
        "blocks": blocks,
        "total_versions": len(blocks),
    }
    crud.log_action(db, actor, f"导出了设备 '{device_id}' 的配置历史（共 {len(blocks)} 个版本）。")
    return export_data

# --- Feature: Config Full-Text Search ---
@router.get("/api/search")
def search_configs(
    q: str,
    device_id: Optional[str] = None,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """在所有（或指定设备的）历史配置区块中全文搜索关键词。"""
    if not q.strip():
        return []
    query = db.query(models.Block)
    if device_id:
        query = query.filter(models.Block.device_id == device_id)
    blocks = query.all()
    results: List[Dict[str, Any]] = []
    q_lower = q.lower()
    for block in blocks:
        try:
            data = json.loads(str(block.data))
            config_text: str = data.get("config", "")
            if q_lower not in config_text.lower():
                continue
            matched_lines = [ln for ln in config_text.splitlines() if q_lower in ln.lower()]
            results.append({
                "device_id": block.device_id,
                "block_index": block.index,
                "timestamp": block.timestamp,
                "hash": block.hash,
                "version": data.get("version"),
                "matched_lines": matched_lines[:10],
            })
        except Exception:
            continue
    return results


# --- Feature: Script CRUD ---
@router.get("/api/scripts")
def list_scripts(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    scripts = crud.get_scripts(db)
    return [{"id": s.id, "name": s.name, "description": s.description, "content": s.content, "device_type": s.device_type, "created_by": s.created_by, "created_at": s.created_at.isoformat().replace('+00:00', 'Z') if s.created_at else None} for s in scripts]

@router.post("/api/scripts", status_code=201)
def create_script(payload: ScriptPayload, actor: str = require_permission("script:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if crud.get_script_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail=f"名为 '{payload.name}' 的脚本已存在。")
    script = crud.create_script(db, payload, actor)
    crud.log_action(db, actor, f"创建了脚本 '{payload.name}'。")
    return {"id": script.id, "name": script.name, "description": script.description, "content": script.content, "device_type": script.device_type, "created_by": script.created_by}

@router.put("/api/scripts/{script_id}")
def update_script(script_id: str, payload: ScriptPayload, actor: str = require_permission("script:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    existing = crud.get_script(db, script_id)
    if not existing:
        raise HTTPException(status_code=404, detail="未找到脚本。")
    if existing.name != payload.name and crud.get_script_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail=f"名为 '{payload.name}' 的脚本已存在。")
    script = crud.update_script(db, script_id, payload)
    crud.log_action(db, actor, f"更新了脚本 '{payload.name}'。")
    return {"id": script.id, "name": script.name, "description": script.description, "content": script.content, "device_type": script.device_type, "created_by": script.created_by}  # type: ignore

@router.delete("/api/scripts/{script_id}", status_code=204)
def delete_script(script_id: str, actor: str = require_permission("script:manage"), db: Session = Depends(get_db)) -> None:
    script = crud.get_script(db, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="未找到脚本。")
    crud.delete_script(db, script_id)
    crud.log_action(db, actor, f"删除了脚本 '{script.name}'。")
    return

@router.post("/api/scripts/{script_id}/execute")
def execute_script(script_id: str, payload: ScriptExecutePayload, actor: str = require_permission("script:execute"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """批量在指定设备上执行脚本（支持 Jinja2 渲染）。"""
    script = crud.get_script(db, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="未找到脚本。")

    results: List[Dict[str, Any]] = []
    for device_id in payload.device_ids:
        device = crud.get_device(db, device_id)
        if not device:
            results.append({"device_id": device_id, "device_name": device_id, "status": "error", "output": "设备不存在。"})
            continue

        # Jinja2 render
        try:
            tmpl = _jinja_env.from_string(str(script.content))
            rendered = tmpl.render(device={
                "name": device.name, "id": device.id,
                "ipAddress": device.ipAddress, "type": device.type,
            })
        except Jinja2TemplateError as e:
            results.append({"device_id": device_id, "device_name": device.name, "status": "error", "output": f"Jinja2 渲染失败: {e}"})
            continue

        # Command interception check
        intercept_error: Optional[str] = None
        for line in rendered.splitlines():
            violated = check_command_against_rules(line)
            if violated:
                intercept_error = f"命令违反拦截规则 '{violated}': '{line}'"
                break
        if intercept_error:
            results.append({"device_id": device_id, "device_name": device.name, "status": "error", "output": intercept_error})
            continue

        if is_simulation_mode():
            results.append({"device_id": device_id, "device_name": device.name, "status": "success", "output": f"[模拟模式] 脚本渲染结果:\n{rendered}"})
            continue

        device_info = get_device_info(device_id)
        if not device_info:
            results.append({"device_id": device_id, "device_name": device.name, "status": "error", "output": "设备未在 config.ini 中配置。"})
            continue

        try:
            with ConnectHandler(**device_info) as net_connect:
                net_connect.enable()
                output: str = net_connect.send_config_set(rendered.splitlines())
            results.append({"device_id": device_id, "device_name": device.name, "status": "success", "output": output})
        except NetmikoBaseException as e:
            results.append({"device_id": device_id, "device_name": device.name, "status": "error", "output": f"SSH 连接失败: {e}"})
        except Exception as e:
            results.append({"device_id": device_id, "device_name": device.name, "status": "error", "output": str(e)})

    crud.log_action(db, actor, f"执行了脚本 '{script.name}'，共 {len(payload.device_ids)} 台设备。")
    return {"script_name": script.name, "results": results}


# --- Feature: Scheduled Tasks CRUD ---
@router.get("/api/scheduled-tasks")
def list_scheduled_tasks(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    tasks = crud.get_scheduled_tasks(db)
    return [{"id": t.id, "name": t.name, "description": t.description, "cron_expr": t.cron_expr, "task_type": t.task_type, "device_ids": json.loads(str(t.device_ids)), "is_enabled": t.is_enabled, "created_by": t.created_by, "last_run": t.last_run.isoformat().replace('+00:00', 'Z') if t.last_run else None, "last_status": t.last_status} for t in tasks]

@router.post("/api/scheduled-tasks", status_code=201)
def create_scheduled_task(payload: ScheduledTaskPayload, actor: str = require_permission("task:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    from scheduler import add_task_job
    task = crud.create_scheduled_task(db, payload, actor)
    add_task_job(task)
    crud.log_action(db, actor, f"创建了定时任务 '{payload.name}' (cron: {payload.cron_expr})。")
    return {"id": task.id, "name": task.name, "description": task.description, "cron_expr": task.cron_expr, "task_type": task.task_type, "device_ids": json.loads(str(task.device_ids)), "is_enabled": task.is_enabled, "created_by": task.created_by}

@router.put("/api/scheduled-tasks/{task_id}")
def update_scheduled_task(task_id: str, payload: ScheduledTaskPayload, actor: str = require_permission("task:manage"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    from scheduler import add_task_job, remove_task_job
    existing = crud.get_scheduled_task(db, task_id)
    if not existing:
        raise HTTPException(status_code=404, detail="未找到定时任务。")
    remove_task_job(task_id)
    task = crud.update_scheduled_task(db, task_id, payload)
    add_task_job(task)  # type: ignore
    crud.log_action(db, actor, f"更新了定时任务 '{payload.name}'。")
    return {"id": task.id, "name": task.name, "description": task.description, "cron_expr": task.cron_expr, "task_type": task.task_type, "device_ids": json.loads(str(task.device_ids)), "is_enabled": task.is_enabled, "created_by": task.created_by}  # type: ignore

@router.delete("/api/scheduled-tasks/{task_id}", status_code=204)
def delete_scheduled_task(task_id: str, actor: str = require_permission("task:manage"), db: Session = Depends(get_db)) -> None:
    from scheduler import remove_task_job
    task = crud.get_scheduled_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="未找到定时任务。")
    remove_task_job(task_id)
    crud.delete_scheduled_task(db, task_id)
    crud.log_action(db, actor, f"删除了定时任务 '{task.name}'。")
    return


@router.get("/api/backup")
def full_system_backup(actor: str = Depends(get_current_actor), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """导出系统全量备份（设备、区块链、策略、模板、审计日志）。"""
    from datetime import datetime as _dtcls, timezone as _tz
    data = crud.get_all_data(db)
    all_blockchains: Dict[str, Any] = {}
    for device in db.query(models.Device).all():
        all_blockchains[device.id] = [
            {"index": b.index, "timestamp": b.timestamp, "hash": b.hash,
             "prev_hash": b.prev_hash, "data": json.loads(str(b.data))}
            for b in sorted(device.blocks, key=lambda b: b.index)
        ]
    backup: Dict[str, Any] = {
        "backup_version": "1.0",
        "created_at": _dtcls.now(_tz.utc).isoformat().replace('+00:00', 'Z'),
        "created_by": actor,
        "devices": data.get("devices", []),
        "blockchains": all_blockchains,
        "templates": data.get("templates", []),
        "policies": data.get("policies", []),
        "audit_log": data.get("audit_log", []),
    }
    crud.log_action(db, actor, "导出了系统全量备份。")
    return backup