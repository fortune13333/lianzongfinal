# routers/tasks.py - Scheduled task CRUD endpoints.

import json
from typing import Dict, List, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from core import ScheduledTaskPayload
from auth_deps import get_current_actor, require_permission

router = APIRouter(tags=["tasks"])


def _task_to_dict(task) -> Dict[str, Any]:
    return {
        "id": task.id,
        "name": task.name,
        "description": task.description,
        "cron_expr": task.cron_expr,
        "task_type": task.task_type,
        "device_ids": json.loads(str(task.device_ids)),
        "is_enabled": task.is_enabled,
        "created_by": task.created_by,
        "created_at": task.created_at.isoformat().replace('+00:00', 'Z') if task.created_at else None,
        "last_run": task.last_run.isoformat().replace('+00:00', 'Z') if task.last_run else None,
        "last_status": task.last_status,
    }


@router.get("/api/scheduled-tasks")
def list_scheduled_tasks(
    actor: str = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return [_task_to_dict(t) for t in crud.get_scheduled_tasks(db)]


@router.post("/api/scheduled-tasks", status_code=201)
def create_scheduled_task(
    payload: ScheduledTaskPayload,
    actor: str = require_permission("task:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from scheduler import add_task_job
    task = crud.create_scheduled_task(db, payload, actor)
    add_task_job(task)
    crud.log_action(db, actor, f"创建了定时任务 '{payload.name}' (cron: {payload.cron_expr})。")
    return _task_to_dict(task)


@router.put("/api/scheduled-tasks/{task_id}")
def update_scheduled_task(
    task_id: str,
    payload: ScheduledTaskPayload,
    actor: str = require_permission("task:manage"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from scheduler import add_task_job, remove_task_job
    existing = crud.get_scheduled_task(db, task_id)
    if not existing:
        raise HTTPException(status_code=404, detail="未找到定时任务。")
    remove_task_job(task_id)
    task = crud.update_scheduled_task(db, task_id, payload)
    add_task_job(task)  # type: ignore
    crud.log_action(db, actor, f"更新了定时任务 '{payload.name}'。")
    return _task_to_dict(task)  # type: ignore


@router.delete("/api/scheduled-tasks/{task_id}", status_code=204)
def delete_scheduled_task(
    task_id: str,
    actor: str = require_permission("task:manage"),
    db: Session = Depends(get_db),
) -> None:
    from scheduler import remove_task_job
    task = crud.get_scheduled_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="未找到定时任务。")
    remove_task_job(task_id)
    crud.delete_scheduled_task(db, task_id)
    crud.log_action(db, actor, f"删除了定时任务 '{task.name}'。")
    return
