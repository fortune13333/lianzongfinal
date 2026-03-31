# routers/blockchain.py - Block creation, rollback, and session-save endpoints.

import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from core import (
    ACTIVE_WEB_SESSIONS, sessions_lock,
    SubmissionPayload, AuditTriggerPayload, RollbackPayload, BlockDict,
)
from auth_deps import get_current_actor, require_permission
from services import (
    is_simulation_mode, get_device_info, get_running_config,
    perform_add_block, perform_rollback,
)

router = APIRouter(tags=["blockchain"])


@router.post("/api/sessions/{device_id}/save", status_code=200)
def save_session_and_audit(
    device_id: str,
    payload: AuditTriggerPayload,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> BlockDict:
    """Fetches the latest running-config from the device and commits it as a new block."""
    if is_simulation_mode():
        raise HTTPException(status_code=400, detail="模拟模式下无法保存会话。")

    # Immediately mark the session as clean to prevent auto-audit on disconnect.
    if payload.sessionId:
        with sessions_lock:
            if payload.sessionId in ACTIVE_WEB_SESSIONS:
                ACTIVE_WEB_SESSIONS[payload.sessionId]['is_dirty'] = False
                logging.info(
                    f"Session {payload.sessionId} for device {device_id} "
                    "marked as CLEAN due to explicit save."
                )

    if not get_device_info(device_id):
        raise HTTPException(
            status_code=404,
            detail=f"在配置文件中未找到设备 ID '{device_id}'。",
        )

    try:
        latest_config = get_running_config(device_id)["config"]
        audit_payload = SubmissionPayload(operator=actor, config=latest_config)
        new_block = perform_add_block(db, device_id, audit_payload)
        crud.log_action(
            db, actor,
            f"通过交互式会话为设备 '{device_id}' 保存并审计了新配置 "
            f"(版本 {new_block['data']['version']})。",
        )
        return new_block
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error during session save for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"保存在线会话时发生意外错误: {e}")


@router.post("/api/blockchains/{device_id}", status_code=201)
def add_block(
    device_id: str,
    payload: SubmissionPayload,
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> BlockDict:
    payload.operator = actor  # Always use JWT-authenticated username.
    new_block = perform_add_block(db, device_id, payload)
    crud.log_action(
        db, actor,
        f"为设备 '{device_id}' 添加了新配置 (版本 {new_block['data']['version']})。",
    )
    return new_block


@router.post("/api/blockchains/{device_id}/rollback", status_code=201)
def rollback_to_version(
    device_id: str,
    payload: RollbackPayload,
    actor: str = require_permission("rollback:execute"),
    db: Session = Depends(get_db),
) -> BlockDict:
    payload.operator = actor
    new_block = perform_rollback(db, device_id, payload)
    crud.log_action(
        db, actor,
        f"将设备 '{device_id}' 回滚至版本 {payload.target_version} "
        f"(新版本为 {new_block['data']['version']})。",
    )
    return new_block
