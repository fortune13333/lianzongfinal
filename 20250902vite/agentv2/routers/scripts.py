# routers/scripts.py - Script library CRUD and execution endpoint.

import logging
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from jinja2 import Environment, BaseLoader, TemplateError as Jinja2TemplateError

import crud
from database import get_db
from core import ScriptPayload, ScriptExecutePayload
from auth_deps import get_current_actor, require_permission
from services import (
    is_simulation_mode, get_device_info,
    check_command_against_rules, perform_pre_deployment_check,
    perform_execute_ssh_config,
)

router = APIRouter(tags=["scripts"])

_jinja_env = Environment(loader=BaseLoader(), autoescape=False)


@router.get("/api/scripts")
def list_scripts(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    scripts = crud.get_scripts(db)
    return [
        {
            "id": s.id, "name": s.name, "description": s.description,
            "content": s.content, "device_type": s.device_type,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat().replace('+00:00', 'Z') if s.created_at else None,
        }
        for s in scripts
    ]


@router.post("/api/scripts", status_code=201)
def create_script(
    payload: ScriptPayload,
    actor: str = require_permission("script:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if crud.get_script_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail=f"名为 '{payload.name}' 的脚本已存在。")
    script = crud.create_script(db, payload, actor)
    crud.log_action(db, actor, f"创建了脚本 '{payload.name}'。")
    return {
        "id": script.id, "name": script.name, "description": script.description,
        "content": script.content, "device_type": script.device_type,
        "created_by": script.created_by,
    }


@router.put("/api/scripts/{script_id}")
def update_script(
    script_id: str,
    payload: ScriptPayload,
    actor: str = require_permission("script:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    existing = crud.get_script(db, script_id)
    if not existing:
        raise HTTPException(status_code=404, detail="未找到脚本。")
    if existing.name != payload.name and crud.get_script_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail=f"名为 '{payload.name}' 的脚本已存在。")
    script = crud.update_script(db, script_id, payload)
    crud.log_action(db, actor, f"更新了脚本 '{payload.name}'。")
    return {
        "id": script.id, "name": script.name, "description": script.description,  # type: ignore
        "content": script.content, "device_type": script.device_type,
        "created_by": script.created_by,
    }


@router.delete("/api/scripts/{script_id}", status_code=204)
def delete_script(
    script_id: str,
    actor: str = require_permission("script:manage"),
    db: Session = Depends(get_db),
) -> None:
    script = crud.get_script(db, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="未找到脚本。")
    crud.delete_script(db, script_id)
    crud.log_action(db, actor, f"删除了脚本 '{script.name}'。")
    return


@router.post("/api/scripts/{script_id}/execute")
def execute_script(
    script_id: str,
    payload: ScriptExecutePayload,
    actor: str = require_permission("script:execute"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """批量在指定设备上执行脚本（支持 Jinja2 渲染 + 合规检查）。"""
    script = crud.get_script(db, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="未找到脚本。")

    results: List[Dict[str, Any]] = []

    for device_id in payload.device_ids:
        device = crud.get_device(db, device_id)
        if not device:
            results.append({
                "device_id": device_id, "device_name": device_id,
                "status": "error", "output": "设备不存在。",
            })
            continue

        # Jinja2 render
        try:
            tmpl = _jinja_env.from_string(str(script.content))
            rendered = tmpl.render(device={
                "name": device.name, "id": device.id,
                "ipAddress": device.ipAddress, "type": device.type,
            })
        except Jinja2TemplateError as e:
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "error", "output": f"Jinja2 渲染失败: {e}",
            })
            continue

        # Hard command interception (config.ini rules)
        intercept_error: Optional[str] = None
        for line in rendered.splitlines():
            violated = check_command_against_rules(line)
            if violated:
                intercept_error = f"命令违反拦截规则 '{violated}': '{line}'"
                break
        if intercept_error:
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "error", "output": intercept_error,
            })
            continue

        # AI/policy compliance check — same gate as bulk_deploy
        try:
            perform_pre_deployment_check(db, device_id, rendered)
        except HTTPException as e:
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "error", "output": f"合规检查未通过: {e.detail}",
            })
            continue

        if is_simulation_mode():
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "success", "output": f"[模拟模式] 脚本渲染结果:\n{rendered}",
            })
            continue

        device_info = get_device_info(device_id)
        if not device_info:
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "error", "output": "设备未在 config.ini 中配置。",
            })
            continue

        try:
            output = perform_execute_ssh_config(device_info, rendered.splitlines())
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "success", "output": output,
            })
        except HTTPException as e:
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "error", "output": e.detail,
            })

    crud.log_action(db, actor, f"执行了脚本 '{script.name}'，共 {len(payload.device_ids)} 台设备。")
    return {"script_name": script.name, "results": results}
