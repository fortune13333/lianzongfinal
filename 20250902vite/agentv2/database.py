# database.txt - SQLAlchemy database setup and session management.

import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# The database URL for SQLite. This will create a file named 'chaintrace.db'
# in the same directory where the agent is run.
SQLALCHEMY_DATABASE_URL = "sqlite:///./chaintrace.db"

# Create the SQLAlchemy engine.
# connect_args is needed only for SQLite to allow multi-threaded access.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Each instance of the SessionLocal class will be a database session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our ORM models.
Base = declarative_base()

def init_db():
    """
    Initializes the database by creating all tables defined in the models.
    This function is called once on application startup.
    """
    try:
        # Import all models here so that Base has them registered before creating tables.
        # This prevents circular import issues.
        __import__('models')
        logging.info("Creating database tables if they don't exist...")
        Base.metadata.create_all(bind=engine)
        logging.info("Database tables checked/created successfully.")
    except Exception as e:
        logging.critical(f"CRITICAL: Failed to initialize database tables. Error: {e}")
        raise

# --- FastAPI Dependency ---

def get_db():
    """
    A dependency for FastAPI routes to get a database session.
    It ensures that the database session is always closed after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()