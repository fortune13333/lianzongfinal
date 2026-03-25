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
from database import init_db, SessionLocal, SQLALCHEMY_DATABASE_URL
import crud


# --- FastAPI App Initialization ---
# Version updated to reflect the new privileged operator feature.
app = FastAPI(title="ChainTrace Local Agent", version="8.5.0-privileged-operator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    # Initialize the database and create tables if they don't exist.
    init_db()
    
    # Use a database session to seed initial data if the DB is empty.
    # This block now includes a robust check for database schema mismatches.
    # 自动迁移: 为现有数据库添加新列（幂等操作，忽略已存在的列）
    try:
        from sqlalchemy import text as _text
        with SessionLocal() as mig_db:
            mig_db.execute(_text("ALTER TABLE devices ADD COLUMN tags TEXT"))
            mig_db.commit()
            logging.info("数据库迁移: 已为 devices 表添加 tags 列。")
    except Exception:
        pass  # 列已存在，忽略

    try:
        with SessionLocal() as db:
            crud.seed_initial_data(db)
            crud.migrate_plaintext_passwords(db)
    except OperationalError as e:
        if "no such column" in str(e):
            logging.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            logging.error("!! 数据库架构不匹配 !!")
            logging.error("!! 您当前的 'chaintrace.db' 文件是旧版本的，与新代码不兼容。")
            logging.error("!! 为解决此问题，请【删除 'chaintrace.db' 文件】，然后重新启动程序。")
            logging.error("!! 系统将自动创建一个结构正确的新数据库文件。")
            logging.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            
            try:
                # Attempt to find the database file's path relative to the config file
                db_path = Path(CONFIG_FILE.parent, Path(SQLALCHEMY_DATABASE_URL.replace("sqlite:///./", "")))
                logging.error(f"!! 您需要删除的文件位于: {db_path.resolve()}")
            except Exception:
                logging.error("!! 请在程序运行目录下查找并删除 'chaintrace.db' 文件。")

            sys.exit(1) # Exit with an error code to prevent the server from starting.
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