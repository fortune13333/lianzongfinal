# services.py - Business logic layer for the ChainTrace Agent.
# This file sits between the API routes and the database CRUD operations.

import logging
import json
import importlib
import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional, cast, List, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import desc
from netmiko import ConnectHandler, NetmikoBaseException # type: ignore
from netmiko.exceptions import NetmikoAuthenticationException # type: ignore
from fastapi import HTTPException

import crud
import models
from database import SessionLocal
from core import (
    calculate_block_hash, 
    config as app_config,
    INTERCEPTION_RULES,
    SubmissionPayload, 
    RollbackPayload, 
    BlockDict, 
    BlockDataDict, 
    ComplianceReportDict,
    AICommandGenerationRequest,
    AIConfigCheckRequest
)

# --- AI Driver Dynamic Loading ---
ai_driver_module = None
driver_name = "unknown" # Pre-define to prevent UnboundLocalError in exception logging
try:
    driver_name = app_config.get('ai_provider', 'driver', fallback='gemini')
    # This dynamic import is the core of the modular AI architecture.
    ai_driver_module = importlib.import_module(f"ai_drivers.{driver_name}_driver")
    logging.info(f"AI driver '{driver_name}' loaded successfully.")
except ImportError:
    logging.error(f"FATAL: Could not find AI driver file for '{driver_name}'. AI features will be disabled. Please check 'driver' in config.ini and the 'ai_drivers' folder.")
    ai_driver_module = None # Ensure it's None on failure
except Exception as e:
    logging.error(f"FATAL: An unexpected error occurred while loading the AI driver '{driver_name}': {e}. AI features will be disabled.")
    ai_driver_module = None # Ensure it's None on failure


# --- Centralized Command Interception Logic ---
def check_command_against_rules(command: str) -> Optional[str]:
    """
    Checks a command against the loaded interception rules from config.ini.
    Returns the name of the violated rule if a violation is found, otherwise None.
    This function is now centralized here to be used by both WebSocket and API routes.
    """
    # Normalize command for reliable checking
    normalized_command = ' '.join(command.strip().lower().split())
    if not normalized_command:
        return None

    # 1. Check 'startswith' rules
    for rule_name, pattern in INTERCEPTION_RULES.get('startswith', []):
        if normalized_command.startswith(pattern):
            logging.warning(f"Command '{normalized_command}' violates startswith rule: '{rule_name}' (pattern: {pattern})")
            return rule_name
            
    # 2. Check 'contains' rules
    for rule_name, pattern in INTERCEPTION_RULES.get('contains', []):
        if pattern in normalized_command:
            logging.warning(f"Command '{normalized_command}' violates contains rule: '{rule_name}' (pattern: {pattern})")
            return rule_name

    # 3. Check 'regex' rules
    for rule_name, compiled_regex in INTERCEPTION_RULES.get('regex', []):
        if compiled_regex.search(normalized_command):
            logging.warning(f"Command '{normalized_command}' violates regex rule: '{rule_name}' (pattern: {compiled_regex.pattern})")
            return rule_name
            
    return None

# --- Simulation & Device Utilities ---
def is_simulation_mode() -> bool:
    if not app_config: return False
    for section in app_config.sections():
        if section.lower().startswith('credentials') and app_config.get(section, 'username', fallback='').upper() == 'SIM_USER':
            logging.info("Simulation mode is ACTIVE because SIM_USER was found.")
            return True
    return False

def get_device_info(device_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves connection information for a device from the config.ini file.
    """
    device_id_upper = device_id.upper()
    if not app_config.has_section('device_map') or not app_config.has_option('device_map', device_id_upper):
        logging.error(f"Device ID '{device_id}' not found in [device_map] of config.ini")
        return None
    
    try:
        ip_address, device_type, creds_section = [part.strip() for part in app_config.get('device_map', device_id_upper).split(',', 2)]
        
        if not app_config.has_section(creds_section):
            logging.error(f"Credentials section '[{creds_section}]' for device '{device_id}' not found in config.ini")
            return None
            
        creds = dict(app_config.items(creds_section))
        
        device_info: Dict[str, Any] = {
            'device_type': device_type,
            'host': ip_address,
            'username': creds.get('username'),
            'password': creds.get('password'),
            'secret': creds.get('secret'), # Will be None if not present, which is fine
            'timeout': 60, # A generous timeout
        }
        return device_info
    except Exception as e:
        logging.error(f"Failed to parse device info for '{device_id}' from config.ini: {e}")
        return None

def get_running_config(device_id: str) -> Dict[str, str]:
    """
    Connects to a device and retrieves its running configuration.
    """
    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 ID '{device_id}'。")

    try:
        with ConnectHandler(**device_info) as net_connect:
            net_connect.enable()
            output = net_connect.send_command("show running-config", read_timeout=120)
            if not isinstance(output, str):
                raise TypeError("The 'show running-config' command did not return a string as expected.")
        return {"config": output}
    except NetmikoAuthenticationException as e:
        logging.error(f"Authentication failed for {device_id}: {e}")
        raise HTTPException(status_code=401, detail=f"设备 '{device_id}' 认证失败。请检查 config.ini 中的凭据。")
    except NetmikoBaseException as e:
        logging.error(f"Netmiko connection error for {device_id}: {e}")
        raise HTTPException(status_code=504, detail=f"连接设备 '{device_id}' 失败: {e}")
    except Exception as e:
        logging.error(f"Unexpected error getting running-config for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"获取设备配置时发生意外错误: {e}")


# --- Blockchain Services ---
def perform_add_block(db: Session, device_id: str, payload: SubmissionPayload, skip_compliance_check: bool = False) -> BlockDict:
    device = crud.get_device_with_details(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}' 的区块链。")
    
    # Sort blocks by index to be certain the last one is correct
    sorted_blocks = sorted(device.blocks, key=lambda b: b.index)
    last_block = sorted_blocks[-1] if sorted_blocks else None
    
    previous_config = ''
    if last_block:
        try:
            previous_config = json.loads(last_block.data).get('config', '')
        except json.JSONDecodeError:
            logging.error(f"Could not parse last block data for device {device_id} at index {last_block.index}. Proceeding with empty previous_config.")
            raise HTTPException(status_code=500, detail=f"Expecting value: line 1 column 1 (char 0)")

    policies_for_audit = device.policies
    settings = crud.get_settings_as_dict(db)
    compliance_report: Optional[ComplianceReportDict] = None
    analysis_results: Dict[str, Any] = {"diff": "N/A", "summary": "N/A", "analysis": "N/A", "security_risks": "N/A"}
    is_compliant = True

    is_ai_enabled = settings.get("is_ai_analysis_enabled", True) and ai_driver_module is not None
    is_auto_audit = payload.changeType == 'auto_audit'

    if is_ai_enabled:
        try:
            analysis_context = ""
            
            if payload.changeType != 'rollback' and not skip_compliance_check:
                ai_mode = settings.get('auto_audit_ai_analysis_mode', 'best_effort')
                
                if not (is_auto_audit and ai_mode == 'disabled'):
                    if ai_driver_module and hasattr(ai_driver_module, 'audit_compliance'):
                        compliance_report = ai_driver_module.audit_compliance([p.__dict__ for p in policies_for_audit], previous_config, payload.config)
                        if compliance_report and compliance_report.get("overall_status") == "failed":
                            is_compliant = False

            if not is_auto_audit and not is_compliant:
                failed_policies = [res.get("policy_name", "Unknown") for res in (compliance_report or {}).get("results", []) if res.get("status") == "failed"]
                error_detail = f"配置违反了合规策略: {', '.join(failed_policies)}"
                raise HTTPException(status_code=400, detail=error_detail)

            if is_auto_audit:
                analysis_context = "auto_audit"
            elif payload.changeType == 'rollback':
                analysis_context = "rollback"
            
            ai_mode = settings.get('auto_audit_ai_analysis_mode', 'best_effort')
            if is_auto_audit and ai_mode == 'disabled':
                 analysis_results = {"summary": "自动审计的AI分析已禁用。", "analysis": "N/A", "security_risks": "N/A", "diff": "N/A"}
            else:
                 if ai_driver_module and hasattr(ai_driver_module, 'analyze_changes'):
                    analysis_results = ai_driver_module.analyze_changes(previous_config, payload.config, analysis_context)

        except HTTPException as e:
            if e.status_code == 400 and not is_auto_audit:
                raise e
            
            logging.error(f"Non-blocking AI error during analysis for {device_id}: {e.detail}")
            analysis_results = { "summary": "AI分析失败", "analysis": f"AI调用失败: {e.detail}", "security_risks": "无法评估。", "diff": "N/A" }
            if is_auto_audit: is_compliant = False # Mark auto-audit as non-compliant if AI fails
        
        except Exception as e:
            logging.error(f"Unexpected non-blocking AI error for {device_id}: {e}")
            analysis_results = { "summary": "AI分析失败", "analysis": f"AI调用时发生未知错误: {e}", "security_risks": "无法评估。", "diff": "N/A" }
            if is_auto_audit: is_compliant = False # Mark auto-audit as non-compliant if AI fails
    else:
        analysis_results["summary"] = "AI分析功能已禁用。"
        if not ai_driver_module:
            analysis_results["summary"] = "AI驱动加载失败，分析功能已禁用。"

    # --- Block Creation ---
    new_index = last_block.index + 1 if last_block else 0
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    prev_hash = last_block.hash if last_block else "0"
    
    new_block_data: BlockDataDict = {
        "deviceId": device_id, 
        "version": new_index + 1, 
        "operator": payload.operator,
        "config": payload.config,
        "diff": analysis_results.get("diff", "差异信息不可用。"), 
        "changeType": cast(Any, payload.changeType),
        "summary": analysis_results.get("summary", "摘要信息不可用。"), 
        "analysis": analysis_results.get("analysis"),
        "security_risks": analysis_results.get("security_risks"), 
        "compliance_report": compliance_report,
        "compliance_status": "passed" if is_compliant else "failed",
        "is_startup_config": False
    }
    
    new_hash = calculate_block_hash(new_block_data, new_index, timestamp, prev_hash)
    new_block: BlockDict = {"index": new_index, "timestamp": timestamp, "data": new_block_data, "prev_hash": prev_hash, "hash": new_hash}

    return crud.add_block(db, device_id, new_block)

def perform_auto_audit(device_id: str, operator: str):
    """
    Synchronous service to perform an auto-audit. Manages its own DB session.
    This function is designed to be run in a separate thread (e.g., via run_in_executor).
    """
    if is_simulation_mode():
        logging.info(f"[AutoAudit] Simulation mode active — skipping SSH auto-audit for device {device_id}.")
        return

    db = SessionLocal()
    try:
        crud.log_action(db, operator, f"用户 ‘{operator}’ 在设备 ‘{device_id}’ 上的一个已修改会话，在未点击’保存并审计’的情况下断开连接。系统已触发自动快照。")

        latest_config_dict = get_running_config(device_id)
        latest_config = latest_config_dict["config"]
        
        audit_payload = SubmissionPayload(
            operator=operator, # Use the actual user's name
            config=latest_config, 
            changeType='auto_audit'
        )
        
        perform_add_block(db, device_id, audit_payload)
        
    except Exception as e:
        logging.error(f"Auto-audit failed for device {device_id}: {e}")
        try:
            crud.log_action(db, operator, f"为设备 '{device_id}' 尝试自动审计失败: {e}")
        except Exception as log_e:
            logging.error(f"Failed to even log the auto-audit failure for {device_id}: {log_e}")
    finally:
        db.close()


def perform_rollback(db: Session, device_id: str, payload: RollbackPayload) -> BlockDict:
    device = crud.get_device_with_details(db, device_id)
    if not device: raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}' 的区块链。")
    
    target_block_model = next((b for b in device.blocks if json.loads(b.data)['version'] == payload.target_version), None)
    if not target_block_model: raise HTTPException(status_code=404, detail=f"未找到目标回滚版本 '{payload.target_version}'。")

    target_config = json.loads(target_block_model.data).get('config', '')
    
    if not is_simulation_mode():
        device_info = get_device_info(device_id)
        if not device_info:
            raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 '{device_id}' 的连接信息。")
        
        config_commands = target_config.splitlines()
        try:
            logging.info(f"Rollback: Connecting to {device_id} to push target config.")
            with ConnectHandler(**device_info) as net_connect:
                net_connect.enable()
                output = net_connect.send_config_set(config_commands)
                logging.info(f"Rollback: Config push output for {device_id}: {output}")
        except NetmikoBaseException as e:
            logging.error(f"Rollback failed during config push for {device_id}: {e}")
            raise HTTPException(status_code=504, detail=f"回滚失败：推送到设备时出错: {e}")

    final_config = target_config
    if not is_simulation_mode():
        try:
            logging.info(f"Rollback: Fetching final running config from {device_id}.")
            final_config_dict = get_running_config(device_id)
            final_config = final_config_dict["config"]
        except HTTPException as e:
            logging.warning(f"Rollback: Could not fetch final config from {device_id} after push: {e.detail}. Proceeding with target config for record.")
    
    submission_payload = SubmissionPayload(
        operator=payload.operator, 
        config=final_config,
        changeType='rollback'
    )
    
    try:
        return perform_add_block(db, device_id, submission_payload)
    except HTTPException as e:
        raise HTTPException(status_code=e.status_code, detail=f"记录回滚时出错: {e.detail}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"记录回滚时发生意外错误: {e}")

def perform_pre_deployment_check(db: Session, device_id: str, new_config: str) -> None:
    """
    Performs a pre-deployment compliance check. Raises HTTPException on failure.
    """
    if not ai_driver_module or not hasattr(ai_driver_module, 'audit_compliance'):
         return # Skip if AI is not loaded or driver doesn't support audit

    device = crud.get_device_with_details(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found for pre-check.")
    
    sorted_blocks = sorted(device.blocks, key=lambda b: b.index)
    last_block = sorted_blocks[-1] if sorted_blocks else None
    previous_config = json.loads(last_block.data).get('config', '') if last_block else ''
    
    policies_for_audit = device.policies
    settings = crud.get_settings_as_dict(db)

    if settings.get("is_ai_analysis_enabled", True):
        report = ai_driver_module.audit_compliance([p.__dict__ for p in policies_for_audit], previous_config, new_config) # type: ignore
        if report and report.get("overall_status") == "failed":
            failed_policies = [res.get("policy_name", "Unknown") for res in report.get("results", []) if res.get("status") == "failed"]
            error_detail = f"配置违反了合规策略: {', '.join(failed_policies)}"
            raise HTTPException(status_code=400, detail=error_detail)


# --- NEW AI PROXY SERVICES ---

def perform_ai_command_generation(payload: AICommandGenerationRequest, db: Session) -> str:
    """
    Handles the business logic for AI command generation proxied from the frontend.
    """
    if not ai_driver_module:
        raise HTTPException(status_code=503, detail="AI驱动加载失败，无法生成命令。")

    device_id = payload.device.get('id')
    if not device_id:
        raise HTTPException(status_code=400, detail="请求中缺少设备ID。")
    
    if not hasattr(ai_driver_module, 'generate_commands'):
        raise HTTPException(status_code=501, detail=f"当前AI驱动 '{driver_name}' 不支持命令生成功能。")

    return ai_driver_module.generate_commands(
        user_input=payload.userInput,
        device=payload.device,
        current_config=payload.currentConfig
    )

def perform_ai_config_check(payload: AIConfigCheckRequest) -> str:
    """
    Handles the business logic for AI config check proxied from the frontend.
    """
    if not ai_driver_module:
        raise HTTPException(status_code=503, detail="AI驱动加载失败，无法执行配置体检。")

    if not hasattr(ai_driver_module, 'check_configuration'):
        raise HTTPException(status_code=501, detail=f"当前AI驱动 '{driver_name}' 不支持配置体检功能。")

    return ai_driver_module.check_configuration(
        config=payload.config,
        device=payload.device
    )

def perform_write_startup(db: Session, device_id: str, token_value: str, actor: str) -> Dict[str, Any]:
    """
    Validates token and writes the running configuration to startup configuration.
    """
    token = crud.get_valid_write_token(db, token_value)
    if not token:
        raise HTTPException(status_code=403, detail="无效或已过期的令牌。")

    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 '{device_id}' 的连接信息。")

    # Determine the correct save command based on device type
    device_type = device_info.get('device_type', '').lower()
    if 'cisco' in device_type:
        save_command = "write memory"
    elif 'huawei' in device_type or 'hp_comware' in device_type:
        save_command = "save"
    else:
        # A sensible default, but might fail on some platforms.
        save_command = "write memory" 

    try:
        logging.info(f"'{actor}' is writing to startup config on device '{device_id}' using command '{save_command}'.")
        with ConnectHandler(**device_info) as net_connect:
            net_connect.enable()
            output = net_connect.send_command(save_command, expect_string=r'#|>', read_timeout=120)
            logging.info(f"Save command output for {device_id}: {output}")

        # Invalidate the token after successful execution
        crud.invalidate_write_token(db, token, used_by=actor, device_id=device_id)
        
        # Mark the latest block as saved to startup
        try:
            latest_block = db.query(models.Block).filter(models.Block.device_id == device_id).order_by(desc(models.Block.index)).first()
            if latest_block:
                block_data = json.loads(latest_block.data)
                block_data['is_startup_config'] = True
                latest_block.data = json.dumps(block_data, sort_keys=True, separators=(',', ':'), ensure_ascii=False) # type: ignore
                db.commit()
                logging.info(f"Marked block index {latest_block.index} for device '{device_id}' as saved to startup.")
        except Exception as e:
            logging.error(f"Failed to mark latest block as startup config for device {device_id}: {e}")
            # Don't fail the whole operation for this, just log it. The primary action (write) succeeded.

        crud.log_action(db, actor, f"成功将设备 '{device_id}' 的运行配置保存到启动配置。")

        return {"status": "success", "message": f"配置已成功保存到设备 '{device_id}' 的启动配置中。", "output": output}

    except NetmikoBaseException as e:
        logging.error(f"Write startup failed for {device_id}: {e}")
        raise HTTPException(status_code=504, detail=f"写入启动配置失败：连接或执行命令时出错: {e}")
    except Exception as e:
        logging.error(f"Unexpected error during write startup for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"写入启动配置时发生意外错误: {e}")