# scheduler.py - APScheduler background task manager for ChainTrace
# Handles scheduled config backups and periodic config pulls.

import json
import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler = BackgroundScheduler(timezone="UTC")


def get_scheduler() -> BackgroundScheduler:
    return _scheduler


def _run_scheduled_job(task_id: str, device_ids_json: str, task_name: str, task_type: str) -> None:
    """Execute a scheduled job (backup or config_pull) for each target device."""
    logging.info(f"[Scheduler] Starting '{task_type}' job '{task_name}' (ID: {task_id})")
    try:
        device_ids = json.loads(device_ids_json)
        # Import here to avoid circular imports at module load time
        from database import SessionLocal
        import crud
        import models
        from services import get_running_config, perform_add_block, is_simulation_mode
        from core import SubmissionPayload

        # config_pull uses changeType='config_pull' to distinguish from manual backups
        change_type = "config_pull" if task_type == "config_pull" else "update"

        success = 0
        errors = 0
        with SessionLocal() as db:
            if device_ids == ["all"]:
                all_devices = db.query(models.Device).all()
                device_ids = [d.id for d in all_devices]

            for device_id in device_ids:
                try:
                    if is_simulation_mode():
                        # In simulation mode just log — no real SSH
                        logging.info(f"[Scheduler] SIMULATION: Skipping SSH for device {device_id}")
                        success += 1
                        continue
                    config_dict = get_running_config(device_id)
                    audit_payload = SubmissionPayload(
                        operator=f"scheduler:{task_name}",
                        config=config_dict["config"],
                        changeType=change_type,
                    )
                    perform_add_block(db, device_id, audit_payload)
                    success += 1
                    logging.info(f"[Scheduler] {task_type} OK for device {device_id}")
                except Exception as e:
                    logging.error(f"[Scheduler] {task_type} FAILED for device {device_id}: {e}")
                    errors += 1

            status = "success" if errors == 0 else "error"
            crud.update_task_run_status(db, task_id, status)
            crud.log_action(
                db, "system:scheduler",
                f"定时任务 '{task_name}'({task_type}) 执行完成: {success} 成功, {errors} 失败。"
            )
    except Exception as e:
        logging.error(f"[Scheduler] Job '{task_name}' (ID: {task_id}) crashed: {e}")
        try:
            from database import SessionLocal
            import crud
            with SessionLocal() as db:
                crud.update_task_run_status(db, task_id, "error")
        except Exception:
            pass


def add_task_job(task) -> None:
    """Register (or replace) an APScheduler job for the given ScheduledTask ORM object."""
    job_id = f"task_{task.id}"

    # Always remove the old job first (idempotent)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    if not task.is_enabled:
        return

    task_type = str(task.task_type)
    if task_type not in ("backup", "config_pull"):
        logging.warning(f"[Scheduler] Unknown task_type '{task_type}' for task '{task.id}'. Skipping.")
        return

    try:
        trigger = CronTrigger.from_crontab(str(task.cron_expr), timezone="UTC")
        _scheduler.add_job(
            _run_scheduled_job,
            trigger=trigger,
            id=job_id,
            args=[str(task.id), str(task.device_ids), str(task.name), task_type],
            replace_existing=True,
            misfire_grace_time=300,  # allow 5 min grace window
        )
        logging.info(f"[Scheduler] Registered '{task_type}' job '{task.name}' cron='{task.cron_expr}'")
    except Exception as e:
        logging.error(f"[Scheduler] Failed to register job for task '{task.id}': {e}")


def remove_task_job(task_id: str) -> None:
    """Remove the APScheduler job for the given task ID."""
    job_id = f"task_{task_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        logging.info(f"[Scheduler] Removed job for task {task_id}")


def init_scheduler(db) -> None:
    """Load all enabled tasks from DB and start the scheduler."""
    import models
    tasks = db.query(models.ScheduledTask).filter(models.ScheduledTask.is_enabled == True).all()
    for task in tasks:
        add_task_job(task)
    _scheduler.start()
    logging.info(f"[Scheduler] Started — {len(tasks)} active job(s) registered.")
