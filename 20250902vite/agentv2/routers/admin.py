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
    AICommandGenerationRequest, AIConfigCheckRequest, LDAPSettingsPayload,
    NotificationRulePayload,
)
from auth_deps import get_current_actor, require_permission
from services import (
    is_simulation_mode,
    perform_ai_command_generation, perform_ai_config_check,
)
from license import load_license

router = APIRouter(tags=["admin"])


# --- Health ---

@router.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "mode": "simulation" if is_simulation_mode() else "live"}


# --- License ---

@router.get("/api/license")
def get_license_info(actor: str = Depends(get_current_actor)) -> Dict[str, Any]:
    lic = load_license()
    return {
        "is_valid": lic.is_valid,
        "customer": lic.customer,
        "max_devices": lic.max_devices,
        "features": lic.features,
        "expires_at": lic.expires_at,
        "error": lic.error,
    }


# --- LDAP Settings ---

@router.get("/api/settings/ldap")
def get_ldap_settings(
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    raw = crud.get_setting(db, "ldap_config", "{}")
    try:
        cfg = json.loads(raw)
    except Exception:
        cfg = {}
    cfg.pop("bind_password", None)  # never return password to frontend
    return cfg


@router.put("/api/settings/ldap")
def update_ldap_settings(
    payload: LDAPSettingsPayload,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    crud.set_setting(db, "ldap_config", payload.model_dump_json())
    crud.log_action(db, actor, "更新了 LDAP 认证配置。")
    return {"status": "ok"}


@router.post("/api/settings/ldap/test")
def test_ldap_connection(
    payload: LDAPSettingsPayload,
    actor: str = require_permission("user:manage"),
) -> Dict[str, str]:
    try:
        from ldap3 import Server, Connection, ALL
        server = Server(payload.server, port=payload.port, use_ssl=payload.use_ssl, get_info=ALL)
        conn = Connection(server, user=payload.bind_dn, password=payload.bind_password, auto_bind=True)
        return {"status": "ok", "message": f"成功连接到 {payload.server}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LDAP 连接失败: {e}")


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
            '"尽力而为"' if payload.auto_audit_ai_analysis_mode == 'best_effort'
            else '"完全禁用"'
        )
        crud.log_action(db, actor, f'将"断连自动审计"的AI分析模式设置为 {mode_text}。')

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
    query = db.query(models.Block).filter(models.Block.data.ilike(f'%{q}%'))
    if device_id:
        query = query.filter(models.Block.device_id == device_id)
    blocks = query.limit(limit * 10).all()
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


# ─────────────────────────────────────────────────────────
# Notification Rules
# ─────────────────────────────────────────────────────────


def _require_alerting(actor: str = Depends(get_current_actor)) -> str:
    """Gate all notification endpoints behind the alerting license feature."""
    if not check_feature("alerting"):
        raise HTTPException(status_code=403, detail="告警通知功能需要企业版 License，请联系销售升级。")
    return actor


@router.get("/api/notification-rules")
def get_notification_rules(
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    rules = crud.get_notification_rules(db)
    return [
        {
            "id": r.id, "name": r.name, "event_type": r.event_type,
            "channel": r.channel,
            "channel_config": json.loads(str(r.channel_config)),
            "is_enabled": r.is_enabled, "created_by": r.created_by,
            "created_at": r.created_at.isoformat().replace('+00:00', 'Z') if r.created_at else None,
            "updated_at": r.updated_at.isoformat().replace('+00:00', 'Z') if r.updated_at else None,
        }
        for r in rules
    ]


@router.post("/api/notification-rules", status_code=201)
def create_notification_rule(
    payload: NotificationRulePayload,
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    new_rule = crud.create_notification_rule(db, payload, actor)
    crud.log_action(db, actor, f"创建了告警通知规则 '{new_rule.name}'。")
    return {
        "id": new_rule.id, "name": new_rule.name, "event_type": new_rule.event_type,
        "channel": new_rule.channel,
        "channel_config": json.loads(str(new_rule.channel_config)),
        "is_enabled": new_rule.is_enabled, "created_by": new_rule.created_by,
    }


@router.put("/api/notification-rules/{rule_id}")
def update_notification_rule(
    rule_id: str,
    payload: NotificationRulePayload,
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    db_rule = crud.get_notification_rule(db, rule_id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="未找到告警通知规则。")
    updated = crud.update_notification_rule(db, rule_id, payload)
    if not updated:
        raise HTTPException(status_code=500, detail="更新告警通知规则失败。")
    crud.log_action(db, actor, f"更新了告警通知规则 '{updated.name}'。")
    return {
        "id": updated.id, "name": updated.name, "event_type": updated.event_type,
        "channel": updated.channel,
        "channel_config": json.loads(str(updated.channel_config)),
        "is_enabled": updated.is_enabled,
    }


@router.delete("/api/notification-rules/{rule_id}", status_code=204)
def delete_notification_rule(
    rule_id: str,
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> None:
    db_rule = crud.get_notification_rule(db, rule_id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="未找到告警通知规则。")
    crud.delete_notification_rule(db, rule_id)
    crud.log_action(db, actor, f"删除了告警通知规则 '{db_rule.name}'。")
    return


@router.post("/api/notification-rules/{rule_id}/test")
def test_notification_rule(
    rule_id: str,
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    db_rule = crud.get_notification_rule(db, rule_id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="未找到告警通知规则。")
    from notifications import deliver_notification
    title = f"测试告警 - {db_rule.name}"
    message_text = f"这是一条来自链踪 ChainTrace 的测试告警消息。\n规则名称: {db_rule.name}\n事件类型: {db_rule.event_type}\n通道: {db_rule.channel}"
    ok = deliver_notification(db_rule, title, message_text, db)
    if ok:
        return {"status": "ok", "message": f"测试通知已通过 {db_rule.channel} 发送成功。"}
    else:
        raise HTTPException(status_code=500, detail=f"测试通知通过 {db_rule.channel} 发送失败，请检查通道配置。")



# ─────────────────────────────────────────────────────────
# Alerts
# ─────────────────────────────────────────────────────────

@router.get("/api/alerts")
def get_alerts(
    event_type: Optional[str] = None,
    limit: int = 200,
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    alerts = crud.get_alerts(db, limit=limit, event_type=event_type)
    return [
        {
            "id": a.id, "rule_id": a.rule_id, "event_type": a.event_type,
            "title": a.title, "message": a.message, "severity": a.severity,
            "source": a.source, "is_sent": a.is_sent,
            "sent_at": a.sent_at.isoformat().replace('+00:00', 'Z') if a.sent_at else None,
            "created_at": a.created_at.isoformat().replace('+00:00', 'Z') if a.created_at else None,
        }
        for a in alerts
    ]


@router.get("/api/alerts/stats")
def get_alert_stats(
    actor: str = Depends(_require_alerting),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return crud.get_alert_stats(db)
