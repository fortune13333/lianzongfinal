# routers/devices.py - Device CRUD, config push, running-config, status polling,
#                      export, and session collaboration endpoints.

import json
import logging
import time
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import models
from database import get_db
from core import (
    config as app_config,
    ACTIVE_WEB_SESSIONS, sessions_lock,
    DevicePayload, ConfigPayload, SessionPayload, WriteStartupPayload,
)
from auth_deps import get_current_actor, require_permission
from services import (
    is_simulation_mode, get_device_info, get_running_config, perform_push_config,
)
from license import get_device_limit

router = APIRouter(tags=["devices"])

# Collaboration session: a heartbeat older than this is considered stale.
SESSION_TIMEOUT_SECONDS = 10


@router.get("/api/data")
def get_all_data(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    data = crud.get_all_data(db)
    enriched_devices: List[Dict[str, Any]] = []
    for device_dict in data.get('devices', []):
        device_id_upper = device_dict.get('id', '').upper()
        netmiko_type: Optional[str] = None
        if app_config.has_option('device_map', device_id_upper):
            try:
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
def reset_data(
    actor: str = require_permission("system:reset"),
    db: Session = Depends(get_db)
) -> None:
    crud.log_action(db, actor, "重置了所有应用数据到初始状态。")
    crud.reset_all_data(db)
    return


@router.post("/api/devices", status_code=201)
def add_device(
    device: DevicePayload,
    actor: str = require_permission("device:create"),
    db: Session = Depends(get_db)
) -> DevicePayload:
    limit = get_device_limit()
    current_count = db.query(models.Device).count()
    if current_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"已达到 License 设备上限（{limit} 台）。请升级 License 或联系销售。"
        )
    if crud.get_device(db, device_id=device.id):
        raise HTTPException(status_code=409, detail=f"设备 ID '{device.id}' 已存在。")
    new_device_orm = crud.create_device_with_genesis_block(db=db, device_payload=device)
    crud.log_action(db, actor, f"添加了新设备 '{device.name}' (ID: {device.id})。")
    device.policyIds = [p.id for p in new_device_orm.policies]
    return device


@router.put("/api/devices/{device_id}")
def update_device(
    device_id: str,
    device: DevicePayload,
    actor: str = require_permission("device:update"),
    db: Session = Depends(get_db)
) -> DevicePayload:
    updated = crud.update_device(db, device_id, device)
    if not updated:
        raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}'。")
    crud.log_action(db, actor, f"更新了设备 '{device.name}' (ID: {device_id}) 的信息。")
    return DevicePayload(
        id=updated.id, name=updated.name, ipAddress=updated.ipAddress, type=updated.type,
        policyIds=[p.id for p in updated.policies],
        tags=[t.strip() for t in updated.tags.split(',') if t.strip()] if updated.tags else []
    )


@router.delete("/api/devices/{device_id}", status_code=204)
def delete_device(
    device_id: str,
    actor: str = require_permission("device:delete"),
    db: Session = Depends(get_db)
) -> None:
    device = crud.get_device(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}'。")
    device_name = device.name
    if crud.delete_device(db, device_id):
        crud.log_action(db, actor, f"删除了设备 '{device_name}' (ID: {device_id})。")
    return


@router.get("/api/device/{device_id}/running-config")
def get_device_running_config(
    device_id: str,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    if is_simulation_mode():
        db_device = crud.get_device_with_details(db, device_id)
        if not db_device or not db_device.blocks:
            raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}' 的区块链。")
        latest_block_data = json.loads(db_device.blocks[-1].data)
        return {"config": latest_block_data.get("config", "")}
    try:
        return get_running_config(device_id)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error getting running-config for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"获取设备配置时发生意外错误: {e}")


@router.post("/api/device/{device_id}/push_config", status_code=200)
def push_config_to_device(
    device_id: str,
    payload: ConfigPayload,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    if is_simulation_mode():
        logging.info(f"SIMULATION MODE: Simulating config push for {device_id}.")
        return {"status": "success", "message": "配置推送模拟成功。"}

    from services import check_command_against_rules
    config_commands = payload.config.splitlines()
    if not config_commands:
        raise HTTPException(status_code=400, detail="配置内容不能为空。")
    for command in config_commands:
        violated_rule = check_command_against_rules(command)
        if violated_rule:
            raise HTTPException(
                status_code=400,
                detail=f"配置内容违反了实时拦截策略: '{violated_rule}' (命令: '{command}')"
            )
    output = perform_push_config(device_id, config_commands)
    crud.log_action(db, actor, f"将配置非交互式地推送到设备 '{device_id}'。")
    return {"status": "success", "output": output}


@router.get("/api/devices/poll-status")
async def poll_all_device_statuses(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db)
):
    """并发检测所有设备的 TCP 22 端口连通性。模拟模式下返回随机数据。"""
    import asyncio
    import datetime as _dt
    import time as _time
    import random as _random
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
            return device_id, {
                "is_online": True, "latency_ms": latency,
                "last_checked": _dt.datetime.now(_tz.utc).isoformat().replace('+00:00', 'Z')
            }
        except Exception:
            return device_id, {
                "is_online": False, "latency_ms": None,
                "last_checked": _dt.datetime.now(_tz.utc).isoformat().replace('+00:00', 'Z')
            }

    results = await asyncio.gather(*[check_device(d.id, str(d.ipAddress)) for d in devices])
    return dict(results)


@router.get("/api/devices/{device_id}/export")
def export_device_history(
    device_id: str,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
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


# --- Session Collaboration (Who is viewing) ---

@router.get("/api/sessions/{device_id}")
def get_device_sessions(device_id: str, actor: str = Depends(get_current_actor)) -> List[Dict[str, str]]:
    """Returns the list of active users currently viewing a device."""
    active_users: List[Dict[str, str]] = []
    now = time.time()
    stale = []
    with sessions_lock:
        for session_id, data in ACTIVE_WEB_SESSIONS.items():
            if (now - data['timestamp']) > SESSION_TIMEOUT_SECONDS:
                stale.append(session_id)
                continue
            if data['device_id'] == device_id:
                active_users.append({'username': data['username'], 'sessionId': session_id})
        for session_id in stale:
            del ACTIVE_WEB_SESSIONS[session_id]
    return active_users


@router.post("/api/sessions/{device_id}", status_code=204)
def join_device_session(
    device_id: str,
    payload: SessionPayload,
    actor: str = Depends(get_current_actor)
) -> None:
    """Heartbeat endpoint to keep a user's 'who is viewing' session alive."""
    with sessions_lock:
        ACTIVE_WEB_SESSIONS[payload.sessionId] = {
            'username': payload.username,
            'sessionId': payload.sessionId,
            'device_id': device_id,
            'timestamp': time.time(),
            'is_dirty': ACTIVE_WEB_SESSIONS.get(payload.sessionId, {}).get('is_dirty', False)
        }
    return


@router.delete("/api/sessions/{device_id}/{session_id}", status_code=204)
def leave_device_session(
    device_id: str,
    session_id: str,
    actor: str = Depends(get_current_actor)
) -> None:
    """Removes a user's session when they navigate away."""
    with sessions_lock:
        if session_id in ACTIVE_WEB_SESSIONS:
            del ACTIVE_WEB_SESSIONS[session_id]
    return


@router.post("/api/devices/{device_id}/write-startup", status_code=200)
def write_startup(
    device_id: str,
    payload: WriteStartupPayload,
    actor: str = require_permission("startup:write"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    from services import perform_write_startup
    if is_simulation_mode():
        return {"status": "success", "message": "写入启动配置模拟成功。"}
    try:
        result = perform_write_startup(db, device_id, payload.token, actor)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error during write startup for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"写入启动配置时发生意外错误: {e}")


@router.post("/api/write-tokens", status_code=201)
def generate_write_token(
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
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
