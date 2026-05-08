# agent.py - Main entry point for the ChainTrace Agent server.
# This file initializes the FastAPI application and includes the routers.

import sys
import uvicorn
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

# Import from our own refactored modules
from core import config, CONFIG_FILE
from api_routes import router as api_router
from websocket_handler import router as websocket_router

# New database imports
from database import init_db, SessionLocal, DATABASE_URL, _is_sqlite
import crud


# --- FastAPI App Initialization ---
# Version updated to reflect the new privileged operator feature.
app = FastAPI(title="ChainTrace Local Agent", version="8.5.0-privileged-operator")
_cors_origins_str: str = config.get('security', 'allowed_origins', fallback='').strip()
if _cors_origins_str:
    _cors_origins = [o.strip() for o in _cors_origins_str.split(',') if o.strip()]
else:
    _cors_origins = ["*"]
    logging.warning(
        "安全警告: [security] allowed_origins 未配置，CORS 已设为允许所有来源 (*)。"
        "生产环境请在 config.ini 中配置具体来源，例如: allowed_origins = http://localhost:5173, http://192.168.1.100:8001"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,  # JWT via Authorization header; credentials=True requires specific origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include Routers ---
app.include_router(api_router)
app.include_router(websocket_router)

# --- Serve Frontend Static Files ---
# Must be mounted LAST so API routes take priority.
_dist_dir = Path(__file__).parent.parent / "dist"
if _dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(_dist_dir), html=True), name="frontend")

# --- Main Execution ---
if __name__ == "__main__":
    # --- Run Alembic migrations to bring the database schema up to date ---
    try:
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_command
        alembic_cfg = AlembicConfig(str(Path(__file__).parent / "alembic.ini"))
        alembic_command.upgrade(alembic_cfg, "head")
        logging.info("数据库迁移: Alembic upgrade to head 完成。")
    except Exception as alembic_err:
        logging.warning(f"Alembic 迁移失败，回退到 SQLAlchemy create_all: {alembic_err}")
        init_db()  # fallback: create tables that don't exist

    # --- Load and display License status ---
    from license import load_license
    lic = load_license()
    if lic.is_valid:
        logging.info(
            f"License 版本: 专业版/企业版 | 客户: {lic.customer} | "
            f"设备上限: {lic.max_devices} | 功能: {lic.features} | 到期: {lic.expires_at}"
        )
    else:
        logging.warning(f"社区版模式（最多 5 台设备，无 LDAP/PDF 功能）: {lic.error}")

    try:
        with SessionLocal() as db:
            crud.seed_initial_data(db)
            crud.migrate_plaintext_passwords(db)
            # Start APScheduler and load saved tasks from DB
            from scheduler import init_scheduler
            init_scheduler(db)
    except OperationalError as e:
        if "no such column" in str(e):
            logging.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            logging.error("!! 数据库架构不匹配 !!")
            if _is_sqlite:
                logging.error("!! 您当前的 'chaintrace.db' 文件是旧版本的，与新代码不兼容。")
                logging.error("!! 为解决此问题，请【删除 'chaintrace.db' 文件】，然后重新启动程序。")
                logging.error("!! 系统将自动创建一个结构正确的新数据库文件。")
                try:
                    db_path = Path(CONFIG_FILE.parent, "chaintrace.db")
                    logging.error(f"!! 您需要删除的文件位于: {db_path.resolve()}")
                except Exception:
                    logging.error("!! 请在程序运行目录下查找并删除 'chaintrace.db' 文件。")
            else:
                logging.error("!! PostgreSQL 数据库架构与代码不匹配，请运行: cd agentv2 && alembic upgrade head")
            logging.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            sys.exit(1)
        else:
            # If it's a different operational error, re-raise it.
            logging.critical(f"启动时发生严重的数据库操作错误: {e}")
            raise e
            
    try:
        host: str = config.get('server', 'host', fallback='127.0.0.1')
        port: int = config.getint('server', 'port', fallback=8000)
    except Exception as e: # Catch any config parser error here
        logging.critical(f"CRITICAL: Failed to read [server] configuration from {CONFIG_FILE}. Error: {e}")
        logging.critical("Please ensure the [server] section exists and the 'port' is a valid integer.")
        sys.exit(1)
    
    logging.info(f"Starting ChainTrace Agent server at http://{host}:{port} using config {CONFIG_FILE}")
    uvicorn.run("agent:app", host=host, port=port, reload=False)