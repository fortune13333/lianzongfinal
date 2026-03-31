# routers/admin.py - Users, policies, settings, health, backup, search, AI proxy.

import json
import logging
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import models
from database import get_db
from core import (
    UserUpdatePayload, Policy as PolicyPayload, AISettingsPayload,
    AICommandGenerationRequest, AIConfigCheckRequest,
)
from auth_deps import get_current_actor, require_permission
from services import (
    is_simulation_mode,
    perform_ai_command_generation, perform_ai_config_check,
)

router = APIRouter(tags=["admin"])


# --- Health ---

@router.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "mode": "simulation" if is_simulation_mode() else "live"}


# --- Users ---

@router.get("/api/users")
def get_users(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    users = crud.get_users(db)
    return [
        {"id": u.id, "username": u.username, "role": u.role,
         "extra_permissions": u.extra_permissions}
        for u in users
    ]


@router.post("/api/users", status_code=201)
def create_user(
    user_payload: UserUpdatePayload,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if crud.get_user_by_username(db, user_payload.username):
        raise HTTPException(status_code=409, detail="用户名已存在。")
    if not user_payload.password:
        raise HTTPException(status_code=400, detail="新用户必须设置密码。")
    new_user = crud.create_user(db, user_payload)
    crud.log_action(db, actor, f"创建了新用户 '{new_user.username}'，角色为 '{new_user.role}'。")
    return {
        "id": new_user.id, "username": new_user.username,
        "role": new_user.role, "extra_permissions": new_user.extra_permissions,
    }


@router.put("/api/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdatePayload,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    user_to_update = crud.get_user(db, user_id)
    if not user_to_update:
        raise HTTPException(status_code=404, detail="未找到用户。")
    if payload.username != user_to_update.username and crud.get_user_by_username(db, payload.username):
        raise HTTPException(status_code=409, detail="用户名已存在。")
    updated_user = crud.update_user(db, user_id, payload)
    log_message = f"更新了用户 '{payload.username}' (ID: {user_id}) 的信息。"
    if payload.password:
        log_message += " 密码已重置。"
    crud.log_action(db, actor, log_message)
    return {
        "id": updated_user.id, "username": updated_user.username,
        "role": updated_user.role, "extra_permissions": updated_user.extra_permissions,
    }


@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> None:
    user_to_delete = crud.get_user(db, user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="未找到用户。")
    if user_to_delete.username == actor:
        raise HTTPException(status_code=400, detail="不能删除自己的账户。")
    username = user_to_delete.username
    crud.delete_user(db, user_id)
    crud.log_action(db, actor, f"删除了用户 '{username}' (ID: {user_id})。")
    return


# --- Policies ---

@router.post("/api/policies", status_code=201)
def create_policy(
    policy: PolicyPayload,
    actor: str = require_permission("policy:manage"),
    db: Session = Depends(get_db),
) -> PolicyPayload:
    if crud.get_policy_by_name(db, policy.name):
        raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")
    crud.create_policy(db, policy)
    crud.log_action(db, actor, f"创建了新合规策略 '{policy.name}'。")
    return policy


@router.put("/api/policies/{policy_id}")
def update_policy(
    policy_id: str,
    policy: PolicyPayload,
    actor: str = require_permission("policy:manage"),
    db: Session = Depends(get_db),
) -> PolicyPayload:
    db_policy = crud.get_policy(db, policy_id)
    if not db_policy:
        raise HTTPException(status_code=404, detail="未找到策略。")
    if db_policy.name != policy.name and crud.get_policy_by_name(db, policy.name):
        raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")
    crud.update_policy(db, policy_id, policy)
    crud.log_action(db, actor, f"更新了合规策略 '{policy.name}'。")
    return policy


@router.delete("/api/policies/{policy_id}", status_code=204)
def delete_policy(
    policy_id: str,
    actor: str = require_permission("policy:manage"),
    db: Session = Depends(get_db),
) -> None:
    policy = crud.get_policy(db, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="未找到策略。")
    crud.delete_policy(db, policy_id)
    crud.log_action(db, actor, f"删除了合规策略 '{policy.name}'。")
    return


# --- Settings ---

@router.put("/api/settings/ai")
def update_ai_settings(
    payload: AISettingsPayload,
    actor: str = require_permission("system:settings"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    crud.update_setting(db, "is_ai_analysis_enabled", str(payload.is_ai_analysis_enabled))
    action = "启用" if payload.is_ai_analysis_enabled else "禁用"
    crud.log_action(db, actor, f"全局 {action} 了后端AI智能分析功能。")

    if payload.auto_audit_ai_analysis_mode:
        crud.update_setting(db, "auto_audit_ai_analysis_mode", payload.auto_audit_ai_analysis_mode)
        mode_text = (
            ""尽力而为"" if payload.auto_audit_ai_analysis_mode == 'best_effort'
            else ""完全禁用""
        )
        crud.log_action(db, actor, f"将"断连自动审计"的AI分析模式设置为 {mode_text}。")

    return crud.get_settings_as_dict(db)


# --- Backup ---

@router.get("/api/backup")
def full_system_backup(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """导出系统全量备份（设备、区块链、策略、模板、审计日志）。"""
    from datetime import datetime as _dtcls, timezone as _tz
    data = crud.get_all_data(db)
    all_blockchains: Dict[str, Any] = {}
    for device in db.query(models.Device).all():
        all_blockchains[device.id] = [
            {
                "index": b.index, "timestamp": b.timestamp,
                "hash": b.hash, "prev_hash": b.prev_hash,
                "data": json.loads(str(b.data)),
            }
            for b in sorted(device.blocks, key=lambda b: b.index)
        ]
    backup: Dict[str, Any] = {
        "backup_version": "2.0",
        "created_at": _dtcls.now(_tz.utc).isoformat().replace('+00:00', 'Z'),
        "created_by": actor,
        "devices": data.get("devices", []),
        "blockchains": all_blockchains,
        "templates": data.get("templates", []),
        "policies": data.get("policies", []),
        "scripts": data.get("scripts", []),
        "scheduled_tasks": data.get("scheduled_tasks", []),
        "audit_log": data.get("audit_log", []),
    }
    crud.log_action(db, actor, "导出了系统全量备份。")
    return backup


# --- Config Search ---

@router.get("/api/search")
def search_configs(
    q: str,
    device_id: Optional[str] = None,
    limit: int = 100,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """在所有（或指定设备的）历史配置区块中全文搜索关键词。limit 最大 500。"""
    if not q.strip():
        return []
    limit = min(limit, 500)
    query = db.query(models.Block)
    if device_id:
        query = query.filter(models.Block.device_id == device_id)
    blocks = query.all()
    results: List[Dict[str, Any]] = []
    q_lower = q.lower()
    for block in blocks:
        if len(results) >= limit:
            break
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


# --- AI Proxy ---

@router.post("/api/ai/generate-command")
def proxy_ai_generate_command(
    payload: AICommandGenerationRequest,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    try:
        commands = perform_ai_command_generation(payload, db)
        crud.log_action(db, actor, f"为设备 '{payload.device.get('id', 'N/A')}' 使用AI生成了命令。")
        return {"commands": commands}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in AI command generation proxy: {e}")
        raise HTTPException(status_code=500, detail=f"AI命令生成时发生意外错误: {e}")


@router.post("/api/ai/check-config")
def proxy_ai_check_config(
    payload: AIConfigCheckRequest,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    try:
        report = perform_ai_config_check(payload)
        crud.log_action(db, actor, f"为设备 '{payload.device.get('id', 'N/A')}' 执行了AI配置体检。")
        return {"report": report}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in AI config check proxy: {e}")
        raise HTTPException(status_code=500, detail=f"AI配置体检时发生意外错误: {e}")
