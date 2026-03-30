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


def _run_backup_job(task_id: str, device_ids_json: str, task_name: str) -> None:
    """Execute a scheduled backup: pull running config from each device and add a block."""
    logging.info(f"[Scheduler] Starting backup job '{task_name}' (ID: {task_id})")
    try:
        device_ids = json.loads(device_ids_json)
        # Import here to avoid circular imports at module load time
        from database import SessionLocal
        import crud
        import models
        from services import get_running_config, perform_add_block, is_simulation_mode
        from core import SubmissionPayload

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
                    )
                    perform_add_block(db, device_id, audit_payload)
                    success += 1
                    logging.info(f"[Scheduler] Backup OK for device {device_id}")
                except Exception as e:
                    logging.error(f"[Scheduler] Backup FAILED for device {device_id}: {e}")
                    errors += 1

            status = "success" if errors == 0 else "error"
            crud.update_task_run_status(db, task_id, status)
            crud.log_action(
                db, "system:scheduler",
                f"定时任务 '{task_name}' 执行完成: {success} 成功, {errors} 失败。"
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

    try:
        trigger = CronTrigger.from_crontab(str(task.cron_expr), timezone="UTC")
        _scheduler.add_job(
            _run_backup_job,
            trigger=trigger,
            id=job_id,
            args=[str(task.id), str(task.device_ids), str(task.name)],
            replace_existing=True,
            misfire_grace_time=300,  # allow 5 min grace window
        )
        logging.info(f"[Scheduler] Registered job '{task.name}' cron='{task.cron_expr}'")
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
