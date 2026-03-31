# routers/templates.py - Config template CRUD and bulk-deploy endpoint.

import logging
from typing import Dict, List, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from jinja2 import Environment, BaseLoader, TemplateError as Jinja2TemplateError

import crud
from database import get_db
from core import (
    ConfigTemplate as TemplatePayload,
    BulkDeployPayload,
    SubmissionPayload,
)
from auth_deps import require_permission, get_current_actor
from services import (
    is_simulation_mode, get_device_info, get_running_config,
    perform_add_block, perform_pre_deployment_check,
    check_command_against_rules, perform_execute_ssh_config,
)

router = APIRouter(tags=["templates"])

_jinja_env = Environment(loader=BaseLoader(), autoescape=False)


@router.post("/api/templates", status_code=201)
def create_template(
    template: TemplatePayload,
    actor: str = require_permission("template:manage"),
    db: Session = Depends(get_db),
) -> TemplatePayload:
    if crud.get_template_by_name(db, template.name):
        raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")
    crud.create_template(db, template)
    crud.log_action(db, actor, f"创建了新配置模板 '{template.name}'。")
    return template


@router.put("/api/templates/{template_id}")
def update_template(
    template_id: str,
    template: TemplatePayload,
    actor: str = require_permission("template:manage"),
    db: Session = Depends(get_db),
) -> TemplatePayload:
    db_template = crud.get_template(db, template_id)
    if not db_template:
        raise HTTPException(status_code=404, detail="未找到模板。")
    if db_template.name != template.name and crud.get_template_by_name(db, template.name):
        raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")
    crud.update_template(db, template_id, template)
    crud.log_action(db, actor, f"更新了配置模板 '{template.name}'。")
    return template


@router.delete("/api/templates/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    actor: str = require_permission("template:manage"),
    db: Session = Depends(get_db),
) -> None:
    template = crud.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="未找到模板。")
    crud.delete_template(db, template_id)
    crud.log_action(db, actor, f"删除了配置模板 '{template.name}'。")
    return


@router.post("/api/bulk-deploy")
def bulk_deploy_template(
    payload: BulkDeployPayload,
    actor: str = require_permission("template:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    template = crud.get_template(db, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="未找到模板。")

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

            # Jinja2 render
            try:
                tmpl = _jinja_env.from_string(str(template.content))
                rendered_config = tmpl.render(device={
                    "name": device.name, "id": device.id,
                    "ipAddress": device.ipAddress, "type": device.type,
                })
            except Jinja2TemplateError as e:
                raise Exception(f"Jinja2 模板渲染失败: {e}")

            # Command interception check
            for command in rendered_config.splitlines():
                violated_rule = check_command_against_rules(command)
                if violated_rule:
                    raise HTTPException(
                        status_code=400,
                        detail=f"模板内容违反了实时拦截策略: '{violated_rule}' (命令: '{command}')",
                    )

            # Pre-flight compliance check
            perform_pre_deployment_check(db, device_id, rendered_config)

            # Push config via SSH
            if not is_simulation_mode():
                device_info = get_device_info(device_id)
                if not device_info:
                    raise Exception("在 config.ini 中未找到设备。")
                perform_execute_ssh_config(device_info, rendered_config.splitlines())

            # After push, use canonical running-config for the block
            final_config = rendered_config
            if not is_simulation_mode():
                final_config = get_running_config(device_id)["config"]

            audit_payload = SubmissionPayload(operator=actor, config=final_config)
            new_block = perform_add_block(db, device_id, audit_payload, skip_compliance_check=True)

            crud.log_action(
                db, actor,
                f"通过批量部署模板 '{template.name}' 更新了设备 '{device_id}' "
                f"(版本 {new_block['data']['version']})。",
            )
            success_count += 1
            results.append({
                "device_id": device_id, "device_name": device.name,
                "status": "success",
                "message": f"部署成功，新版本为 {new_block['data']['version']}。",
            })

        except HTTPException as e:
            logging.warning(f"Deployment failed for {device_id}: {e.detail}")
            failures.append(f"{device_id} ({device_name_for_logs}): {e.status_code}: {e.detail}")
            results.append({
                "device_id": device_id, "device_name": device_name_for_logs,
                "status": "failure", "message": f"{e.status_code}: {e.detail}",
            })
        except Exception as e:
            logging.error(f"Deployment failed for {device_id}: {e}")
            failures.append(f"{device_id} ({device_name_for_logs}): {e}")
            results.append({
                "device_id": device_id, "device_name": device_name_for_logs,
                "status": "failure", "message": str(e),
            })

    crud.create_deployment_record(db, actor, template.name, payload.device_ids, results)
    message = f"部署完成。{success_count} 台成功，{len(failures)} 台失败。"
    return {"message": message, "success_count": success_count, "failures": failures}
