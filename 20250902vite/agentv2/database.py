# database.py - SQLAlchemy database setup and session management.

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Supports both SQLite (dev default) and PostgreSQL (production via DATABASE_URL env var).
# To use PostgreSQL: export DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./chaintrace.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Fallback: create tables directly via SQLAlchemy if Alembic is unavailable."""
    try:
        __import__('models')
        logging.info("Creating database tables if they don't exist...")
        Base.metadata.create_all(bind=engine)
        logging.info("Database tables checked/created successfully.")
    except Exception as e:
        logging.critical(f"CRITICAL: Failed to initialize database tables. Error: {e}")
        raise


def get_db():
    """FastAPI dependency: yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
