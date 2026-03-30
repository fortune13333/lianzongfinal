# crud.txt - Create, Read, Update, Delete operations for database models.
# This file is the single source of truth for all database interactions.

import json
import logging
import datetime
import uuid
import secrets
from typing import Dict, List, Any, Optional, cast

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

import models
from core import (
    calculate_block_hash, UserUpdatePayload, DevicePayload,
    ConfigTemplate as TemplatePayload, Policy as PolicyPayload, BlockDataDict, BlockDict,
    get_password_hash
)


# --- Initial Data Structure (For seeding only) ---
INITIAL_DATA_RAW: Dict[str, Any] = {
    "devices": [
        {"id": "RTR01-NYC", "name": "Core Router NYC", "ipAddress": "192.168.1.1", "type": "Router"},
        {"id": "SW01-SFO", "name": "Access Switch SFO", "ipAddress": "10.10.5.254", "type": "Switch"},
        {"id": "FW01-LON", "name": "Edge Firewall London", "ipAddress": "203.0.113.1", "type": "Firewall"},
    ],
    "users": [
        {"id": 1, "username": "admin", "password": "admin", "role": "admin"},
        {"id": 2, "username": "operator1", "password": "password", "role": "operator"},
        {"id": 3, "username": "net_admin", "password": "password123", "role": "operator"},
    ],
    "settings": {
        "is_ai_analysis_enabled": True,
        "auto_audit_ai_analysis_mode": "best_effort"
    },
    "blockchains": {
        "RTR01-NYC": [{"index": 0, "timestamp": "2023-01-01T10:00:00Z", "data": { "deviceId": "RTR01-NYC", "version": 1, "operator": "system_init", "config": "hostname RTR01-NYC\n!\ninterface GigabitEthernet0/0\n ip address 192.168.1.1 255.255.255.0\n no shutdown\n!\nrouter ospf 1\n network 192.168.1.0 0.0.0.255 area 0\n!\nend", "diff": "+ hostname RTR01-NYC\n+ !\n+ interface GigabitEthernet0/0\n+  ip address 192.168.1.1 255.255.255.0\n+  no shutdown\n+ !\n+ router ospf 1\n+  network 192.168.1.0 0.0.0.255 area 0\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"}],
        "SW01-SFO": [{"index": 0, "timestamp": "2023-01-02T11:30:00Z", "data": { "deviceId": "SW01-SFO", "version": 1, "operator": "system_init", "config": "hostname SW01-SFO\n!\nvlan 10\n name USERS\n!\ninterface FastEthernet0/1\n switchport mode access\n switchport access vlan 10\n!\nend", "diff": "+ hostname SW01-SFO\n+ !\n+ vlan 10\n+  name USERS\n+ !\n+ interface FastEthernet0/1\n+  switchport mode access\n+  switchport access vlan 10\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"}],
        "FW01-LON": [{"index": 0, "timestamp": "2023-01-03T09:00:00Z", "data": { "deviceId": "FW01-LON", "version": 1, "operator": "system_init", "config": "hostname FW01-LON\n!\nip access-list extended INCOMING_FILTER\n permit tcp any host 203.0.113.1 eq 443\n deny ip any any log\n!\ninterface GigabitEthernet0/1\n ip access-group INCOMING_FILTER in\n!\nend", "diff": "+ hostname FW01-LON\n+ !\n+ ip access-list extended INCOMING_FILTER\n+  permit tcp any host 203.0.113.1 eq 443\n+  deny ip any any log\n+ !\n+ interface GigabitEthernet0/1\n+  ip access-group INCOMING_FILTER in\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"}],
    }
}

def get_initial_data_with_hashes() -> Dict[str, Any]:
    data = json.loads(json.dumps(INITIAL_DATA_RAW))
    for chain in data["blockchains"].values():
        for block in chain:
            block["hash"] = calculate_block_hash(cast(BlockDataDict, block["data"]), block["index"], block["timestamp"], block["prev_hash"])
    return data

INITIAL_DATA = get_initial_data_with_hashes()
MAX_LOG_ENTRIES = 1000

# --- Seeding ---
def seed_initial_data(db: Session):
    if db.query(models.User).count() > 0: return
    logging.warning("Database is empty. Seeding with initial data...")
    try:
        for user_data in INITIAL_DATA.get("users", []):
            db.add(models.User(
                id=user_data['id'],
                username=user_data['username'],
                password=get_password_hash(user_data['password']),
                role=user_data['role'],
                extra_permissions=user_data.get('extra_permissions'),
            ))
        for device_data in INITIAL_DATA.get("devices", []):
            db.add(models.Device(id=device_data["id"], name=device_data["name"], ipAddress=device_data["ipAddress"], type=device_data["type"]))
            for block_data in INITIAL_DATA.get("blockchains", {}).get(device_data["id"], []):
                db.add(models.Block(device_id=device_data["id"], index=block_data["index"], timestamp=block_data["timestamp"], data=json.dumps(block_data["data"], sort_keys=True, separators=(',', ':'), ensure_ascii=False), prev_hash=block_data["prev_hash"], hash=block_data["hash"]))
        for key, value in INITIAL_DATA.get("settings", {}).items():
            db.add(models.Setting(key=key, value=str(value)))
        db.commit()
        logging.info("Initial data seeded successfully.")
    except Exception as e:
        logging.error(f"Error seeding initial data: {e}")
        db.rollback()
        raise

# --- Data Transformation ---
def _format_data_for_frontend(
    db_devices: List[models.Device],
    db_users: List[models.User],
    db_logs: List[models.AuditLog],
    db_templates: List[models.ConfigTemplate],
    db_policies: List[models.Policy],
    db_settings: List[models.Setting],
    db_deploy_history: List[models.DeploymentRecord],
    db_write_tokens: List[models.WriteToken],
    db_scripts: Optional[List[models.Script]] = None,
    db_scheduled_tasks: Optional[List[models.ScheduledTask]] = None,
) -> Dict[str, Any]:
    
    # --- ROBUSTNESS FIX START ---
    formatted_blocks: Dict[str, List[Dict[str, Any]]] = {}
    for device in db_devices:
        chain = []
        # Sort blocks by index to ensure chronological order
        sorted_blocks = sorted(device.blocks, key=lambda b: b.index)
        for b in sorted_blocks:
            block_data: Dict[str, Any]
            try:
                # Attempt to parse the JSON data
                block_data = json.loads(str(b.data))
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, create a placeholder error block
                logging.warning(f"Corrupted block data found for device {device.id} at index {b.index}. Block ID: {b.id}")
                block_data = {
                    "deviceId": device.id,
                    "version": b.index + 1,
                    "operator": "system_error",
                    "config": f"# ERROR: Block data for version {b.index + 1} is corrupted and cannot be displayed.",
                    "diff": "N/A",
                    "changeType": "error",
                    "summary": f"错误：版本 {b.index + 1} 的区块数据已损坏",
                    "analysis": "无法解析此区块的JSON数据。这可能是由于手动数据库修改或数据损坏造成的。",
                    "security_risks": "无法评估。",
                    "compliance_report": None,
                }
            
            chain.append({
                "index": b.index, "timestamp": b.timestamp, 
                "data": block_data, "prev_hash": b.prev_hash, "hash": b.hash
            })
        formatted_blocks[device.id] = chain
    # --- ROBUSTNESS FIX END ---

    settings = {s.key: json.loads(str(s.value).lower()) if str(s.value).lower() in ['true', 'false'] else str(s.value) for s in db_settings}

    # Ensure defaults for new settings if they don't exist in the DB for backward compatibility
    if "auto_audit_ai_analysis_mode" not in settings:
        settings["auto_audit_ai_analysis_mode"] = "best_effort"

    return {
        "devices": [{"id": d.id, "name": d.name, "ipAddress": d.ipAddress, "type": d.type, "policyIds": [p.id for p in d.policies], "tags": [t.strip() for t in str(d.tags).split(',') if t.strip()] if d.tags else []} for d in db_devices],
        "blockchains": formatted_blocks,
        "users": [{"id": u.id, "username": u.username, "role": u.role, "extra_permissions": u.extra_permissions} for u in db_users],
        "audit_log": [{"timestamp": l.timestamp.isoformat().replace('+00:00', 'Z'), "username": l.username, "action": l.action} for l in db_logs],
        "templates": [{"id": t.id, "name": t.name, "content": t.content} for t in db_templates],
        "policies": [{"id": p.id, "name": p.name, "severity": p.severity, "description": p.description, "rule": p.rule, "enabled": p.enabled} for p in db_policies],
        "deployment_history": [{"id": h.id, "timestamp": h.timestamp.isoformat().replace('+00:00', 'Z'), "operator": h.operator, "template_name": h.template_name, "status": h.status, "summary": h.summary, "target_devices": json.loads(str(h.target_devices)), "results": json.loads(str(h.results))} for h in db_deploy_history],
        "settings": settings,
        "write_tokens": [{"id": t.id, "token_value": t.token_value, "created_by_admin": t.created_by_admin, "created_at": t.created_at.isoformat().replace('+00:00', 'Z'), "expires_at": t.expires_at.isoformat().replace('+00:00', 'Z'), "is_used": t.is_used} for t in db_write_tokens],
        "scripts": [{"id": s.id, "name": s.name, "description": s.description, "content": s.content, "device_type": s.device_type, "created_by": s.created_by, "created_at": s.created_at.isoformat().replace('+00:00', 'Z') if s.created_at else None} for s in (db_scripts or [])],
        "scheduled_tasks": [{"id": t.id, "name": t.name, "description": t.description, "cron_expr": t.cron_expr, "task_type": t.task_type, "device_ids": json.loads(str(t.device_ids)), "is_enabled": t.is_enabled, "created_by": t.created_by, "created_at": t.created_at.isoformat().replace('+00:00', 'Z') if t.created_at else None, "last_run": t.last_run.isoformat().replace('+00:00', 'Z') if t.last_run else None, "last_status": t.last_status} for t in (db_scheduled_tasks or [])],
    }

# --- Generic CRUD ---
def migrate_plaintext_passwords(db: Session):
    """将数据库中遗留的明文密码自动迁移为 bcrypt 哈希（幂等操作，可安全重复调用）。"""
    users = db.query(models.User).all()
    migrated = 0
    for user in users:
        pw = str(user.password)
        if pw and not pw.startswith('$2b$'):
            user.password = get_password_hash(pw)  # type: ignore
            migrated += 1
    if migrated > 0:
        db.commit()
        logging.warning(f"密码迁移: 已将 {migrated} 个明文密码自动转换为 bcrypt 哈希。")

def get_all_data(db: Session) -> Dict[str, Any]:
    devices = db.query(models.Device).options(joinedload(models.Device.blocks), joinedload(models.Device.policies)).all()
    users = db.query(models.User).all()
    logs = db.query(models.AuditLog).order_by(desc(models.AuditLog.timestamp)).limit(MAX_LOG_ENTRIES).all()
    templates = db.query(models.ConfigTemplate).all()
    policies = db.query(models.Policy).all()
    settings = db.query(models.Setting).all()
    deploy_history = db.query(models.DeploymentRecord).order_by(desc(models.DeploymentRecord.timestamp)).limit(100).all()
    write_tokens = db.query(models.WriteToken).order_by(desc(models.WriteToken.created_at)).limit(100).all()
    scripts = db.query(models.Script).order_by(models.Script.name).all()
    scheduled_tasks = db.query(models.ScheduledTask).all()
    return _format_data_for_frontend(devices, users, logs, templates, policies, settings, deploy_history, write_tokens, scripts, scheduled_tasks)

def reset_all_data(db: Session):
    for table in reversed(models.Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    seed_initial_data(db)

def log_action(db: Session, username: str, action: str):
    db.add(models.AuditLog(username=username, action=action))
    db.commit()

# --- Device & Block ---
def get_device(db: Session, device_id: str) -> Optional[models.Device]:
    return db.query(models.Device).filter(models.Device.id == device_id).first()

def get_device_with_details(db: Session, device_id: str) -> Optional[models.Device]:
    return db.query(models.Device).options(joinedload(models.Device.blocks), joinedload(models.Device.policies)).filter(models.Device.id == device_id).first()

def create_device_with_genesis_block(db: Session, device_payload: DevicePayload) -> models.Device:
    new_device_orm = models.Device(id=device_payload.id, name=device_payload.name, ipAddress=device_payload.ipAddress, type=device_payload.type, tags=','.join(device_payload.tags) if device_payload.tags else None)
    if device_payload.policyIds:
        policies = db.query(models.Policy).filter(models.Policy.id.in_(device_payload.policyIds)).all()
        new_device_orm.policies = policies
    
    db.add(new_device_orm)
    
    genesis_data: Dict[str, Any] = {
        "deviceId": device_payload.id, 
        "version": 1, 
        "operator": "system_init", 
        "config": f"hostname {device_payload.name}\n!\n! Initial configuration created by ChainTrace.", 
        "diff": f"+ hostname {device_payload.name}\n+ !\n+ ! Initial configuration created by ChainTrace.", 
        "changeType": "initial", 
        "summary": "设备已创建。", 
        "analysis": "这是新设备的第一个配置区块...", 
        "security_risks": "无。", 
        "compliance_report": {"overall_status": "passed", "results": []},
        "is_startup_config": False
    }
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    hash_hex = calculate_block_hash(cast(BlockDataDict, genesis_data), 0, timestamp, "0")
    db.add(models.Block(device_id=device_payload.id, index=0, timestamp=timestamp, data=json.dumps(genesis_data, sort_keys=True, separators=(',', ':'), ensure_ascii=False), prev_hash="0", hash=hash_hex))
    
    db.commit()
    db.refresh(new_device_orm)
    return new_device_orm

def update_device(db: Session, device_id: str, device_update: DevicePayload) -> Optional[models.Device]:
    db_device = db.query(models.Device).options(joinedload(models.Device.policies)).filter(models.Device.id == device_id).first()
    if db_device:
        db_device.name = device_update.name  # type: ignore
        db_device.ipAddress = device_update.ipAddress  # type: ignore
        db_device.type = device_update.type  # type: ignore
        db_device.tags = ','.join(device_update.tags) if device_update.tags else None  # type: ignore
        
        if device_update.policyIds is not None:
            policies = db.query(models.Policy).filter(models.Policy.id.in_(device_update.policyIds)).all()
            db_device.policies = policies
        
        db.commit()
        db.refresh(db_device)
    return db_device


def delete_device(db: Session, device_id: str) -> bool:
    db_device = get_device(db, device_id)
    if db_device:
        db.delete(db_device)
        db.commit()
        return True
    return False

def add_block(db: Session, device_id: str, new_block: BlockDict) -> BlockDict:
    db.add(models.Block(device_id=device_id, index=new_block["index"], timestamp=new_block["timestamp"], data=json.dumps(new_block["data"], sort_keys=True, separators=(',', ':'), ensure_ascii=False), prev_hash=new_block["prev_hash"], hash=new_block["hash"]))
    db.commit()
    return new_block

# --- User ---
def get_user(db: Session, user_id: int) -> Optional[models.User]: return db.query(models.User).filter(models.User.id == user_id).first()
def get_user_by_username(db: Session, username: str) -> Optional[models.User]: return db.query(models.User).filter(models.User.username == username).first()
def get_users(db: Session) -> List[models.User]: return db.query(models.User).all()

def create_user(db: Session, user: UserUpdatePayload) -> models.User:
    db_user = models.User(
        username=user.username,
        password=get_password_hash(user.password) if user.password else "",
        role=user.role,
        extra_permissions=user.extra_permissions if user.role == 'operator' else None
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user: UserUpdatePayload) -> models.User:
    db_user = get_user(db, user_id)
    if db_user:
        db_user.username = user.username  # type: ignore
        db_user.role = user.role  # type: ignore
        if user.password:
            db_user.password = get_password_hash(user.password)  # type: ignore
        # Only set permissions for operators, clear for admins
        db_user.extra_permissions = user.extra_permissions if user.role == 'operator' else None  # type: ignore
        db.commit()
        db.refresh(db_user)
    return db_user # type: ignore

def delete_user(db: Session, user_id: int): 
    db_user = get_user(db, user_id)
    if db_user: 
        db.delete(db_user)
        db.commit()

# --- Template ---
def get_template(db: Session, template_id: str) -> Optional[models.ConfigTemplate]: return db.query(models.ConfigTemplate).filter(models.ConfigTemplate.id == template_id).first()
def get_template_by_name(db: Session, name: str) -> Optional[models.ConfigTemplate]: return db.query(models.ConfigTemplate).filter(models.ConfigTemplate.name == name).first()
def create_template(db: Session, template: TemplatePayload):
    db_template = models.ConfigTemplate(**template.model_dump())
    db.add(db_template); db.commit()
def update_template(db: Session, template_id: str, template: TemplatePayload):
    db_template = get_template(db, template_id)
    if db_template:
        db_template.name = template.name  # type: ignore
        db_template.content = template.content  # type: ignore
        db.commit()
def delete_template(db: Session, template_id: str):
    db_template = get_template(db, template_id)
    if db_template: db.delete(db_template); db.commit()

# --- Policy ---
def get_policy(db: Session, policy_id: str) -> Optional[models.Policy]: return db.query(models.Policy).filter(models.Policy.id == policy_id).first()
def get_policy_by_name(db: Session, name: str) -> Optional[models.Policy]: return db.query(models.Policy).filter(models.Policy.name == name).first()
def get_policies(db: Session) -> List[models.Policy]: return db.query(models.Policy).all()
def create_policy(db: Session, policy: PolicyPayload):
    db_policy = models.Policy(**policy.model_dump())
    db.add(db_policy); db.commit()
def update_policy(db: Session, policy_id: str, policy: PolicyPayload):
    db_policy = get_policy(db, policy_id)
    if db_policy:
        db_policy.name = policy.name  # type: ignore
        db_policy.severity = policy.severity  # type: ignore
        db_policy.description = policy.description  # type: ignore
        db_policy.rule = policy.rule  # type: ignore
        db_policy.enabled = policy.enabled  # type: ignore
        db.commit()
def delete_policy(db: Session, policy_id: str):
    db_policy = get_policy(db, policy_id)
    if db_policy: db.delete(db_policy); db.commit()

# --- Settings ---
def get_settings(db: Session) -> List[models.Setting]: return db.query(models.Setting).all()
def get_settings_as_dict(db: Session) -> Dict[str, Any]:
    settings = get_settings(db)
    # The explicit cast to str(s.value) is important to satisfy type checkers
    # as s.value could be inferred as a Column type by some linters.
    return {s.key: json.loads(str(s.value).lower()) if str(s.value).lower() in ['true', 'false'] else str(s.value) for s in settings}
def update_setting(db: Session, key: str, value: str):
    db_setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if db_setting: db_setting.value = value  # type: ignore
    else: db_setting = models.Setting(key=key, value=value); db.add(db_setting)
    db.commit()

# --- Deployment History ---
def create_deployment_record(db: Session, operator: str, template_name: str, target_devices: List[str], results: List[Dict[str, Any]]):
    success_count = sum(1 for r in results if r['status'] == 'success')
    status = "Completed" if success_count == len(results) else "Completed with Errors"
    summary = f"{success_count} 成功, {len(results) - success_count} 失败。"
    
    record = models.DeploymentRecord(
        id=str(uuid.uuid4()),
        operator=operator,
        template_name=template_name,
        status=status,
        summary=summary,
        target_devices=json.dumps(target_devices),
        results=json.dumps(results)
    )
    db.add(record)
    db.commit()

# --- Write Tokens ---
def create_write_token(db: Session, admin_username: str) -> models.WriteToken:
    """Generates and stores a new one-time write token."""
    token = secrets.token_hex(16)  # 128-bit entropy
    now = datetime.datetime.now(datetime.timezone.utc)
    # Token is valid for 15 minutes
    expires = now + datetime.timedelta(minutes=15)
    
    db_token = models.WriteToken(
        token_value=token,
        created_by_admin=admin_username,
        expires_at=expires
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

def get_valid_write_token(db: Session, token_value: str) -> Optional[models.WriteToken]:
    """Retrieves a token if it exists, is not used, and has not expired."""
    now = datetime.datetime.now(datetime.timezone.utc)
    return db.query(models.WriteToken).filter(
        models.WriteToken.token_value == token_value,
        models.WriteToken.is_used == False,
        models.WriteToken.expires_at > now
    ).first()

def invalidate_write_token(db: Session, token: models.WriteToken, used_by: str, device_id: str):
    """Marks a token as used."""
    token.is_used = True # type: ignore
    token.used_by = used_by # type: ignore
    token.used_on_device = device_id # type: ignore
    token.used_at = datetime.datetime.now(datetime.timezone.utc) # type: ignore
    db.commit()
    db.refresh(token)
    return token

# --- Script ---
def get_scripts(db: Session) -> List[models.Script]:
    return db.query(models.Script).order_by(models.Script.name).all()

def get_script(db: Session, script_id: str) -> Optional[models.Script]:
    return db.query(models.Script).filter(models.Script.id == script_id).first()

def get_script_by_name(db: Session, name: str) -> Optional[models.Script]:
    return db.query(models.Script).filter(models.Script.name == name).first()

def create_script(db: Session, script_payload: Any, created_by: str) -> models.Script:
    db_script = models.Script(
        id=script_payload.id,
        name=script_payload.name,
        description=script_payload.description,
        content=script_payload.content,
        device_type=script_payload.device_type,
        created_by=created_by,
    )
    db.add(db_script)
    db.commit()
    db.refresh(db_script)
    return db_script

def update_script(db: Session, script_id: str, script_payload: Any) -> Optional[models.Script]:
    db_script = get_script(db, script_id)
    if db_script:
        db_script.name = script_payload.name  # type: ignore
        db_script.description = script_payload.description  # type: ignore
        db_script.content = script_payload.content  # type: ignore
        db_script.device_type = script_payload.device_type  # type: ignore
        db.commit()
        db.refresh(db_script)
    return db_script

def delete_script(db: Session, script_id: str) -> bool:
    db_script = get_script(db, script_id)
    if db_script:
        db.delete(db_script)
        db.commit()
        return True
    return False

# --- ScheduledTask ---
def get_scheduled_tasks(db: Session) -> List[models.ScheduledTask]:
    return db.query(models.ScheduledTask).all()

def get_scheduled_task(db: Session, task_id: str) -> Optional[models.ScheduledTask]:
    return db.query(models.ScheduledTask).filter(models.ScheduledTask.id == task_id).first()

def create_scheduled_task(db: Session, task_payload: Any, created_by: str) -> models.ScheduledTask:
    db_task = models.ScheduledTask(
        id=task_payload.id,
        name=task_payload.name,
        description=task_payload.description,
        cron_expr=task_payload.cron_expr,
        task_type=task_payload.task_type,
        device_ids=json.dumps(task_payload.device_ids),
        is_enabled=task_payload.is_enabled,
        created_by=created_by,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

def update_scheduled_task(db: Session, task_id: str, task_payload: Any) -> Optional[models.ScheduledTask]:
    db_task = get_scheduled_task(db, task_id)
    if db_task:
        db_task.name = task_payload.name  # type: ignore
        db_task.description = task_payload.description  # type: ignore
        db_task.cron_expr = task_payload.cron_expr  # type: ignore
        db_task.task_type = task_payload.task_type  # type: ignore
        db_task.device_ids = json.dumps(task_payload.device_ids)  # type: ignore
        db_task.is_enabled = task_payload.is_enabled  # type: ignore
        db.commit()
        db.refresh(db_task)
    return db_task

def delete_scheduled_task(db: Session, task_id: str) -> bool:
    db_task = get_scheduled_task(db, task_id)
    if db_task:
        db.delete(db_task)
        db.commit()
        return True
    return False

def update_task_run_status(db: Session, task_id: str, status: str):
    db_task = get_scheduled_task(db, task_id)
    if db_task:
        db_task.last_run = datetime.datetime.now(datetime.timezone.utc)  # type: ignore
        db_task.last_status = status  # type: ignore
        db.commit()