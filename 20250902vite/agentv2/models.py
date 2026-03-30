# models.txt - SQLAlchemy ORM models for all database tables.

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from database import Base

# New association table for the many-to-many relationship between devices and policies
device_policy_association = Table('device_policy_association', Base.metadata,
    Column('device_id', String, ForeignKey('devices.id', ondelete="CASCADE"), primary_key=True),
    Column('policy_id', String, ForeignKey('policies.id', ondelete="CASCADE"), primary_key=True)
)

class Device(Base):
    __tablename__ = "devices"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ipAddress = Column(String, nullable=False)
    type = Column(String, nullable=False)
    tags = Column(String, nullable=True)
    blocks = relationship("Block", back_populates="device", cascade="all, delete-orphan", lazy="joined")
    # Relationship to associated policies
    policies = relationship("Policy", secondary=device_policy_association, back_populates="devices", lazy="joined")

class Block(Base):
    __tablename__ = "blocks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)
    timestamp = Column(String, nullable=False)
    data = Column(Text, nullable=False) 
    prev_hash = Column(String, nullable=False)
    hash = Column(String, nullable=False, index=True, unique=True)
    
    device = relationship("Device", back_populates="blocks")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    extra_permissions = Column(String, nullable=True)
    
class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    username = Column(String, nullable=False)
    action = Column(String, nullable=False)
    
class ConfigTemplate(Base):
    __tablename__ = "templates"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)
    
class Policy(Base):
    __tablename__ = "policies"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    severity = Column(String, nullable=False)
    description = Column(String, nullable=False)
    rule = Column(Text, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    # Relationship to associated devices
    devices = relationship("Device", secondary=device_policy_association, back_populates="policies")

class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)

class DeploymentRecord(Base):
    __tablename__ = "deployment_history"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    operator = Column(String, nullable=False)
    template_name = Column(String, nullable=False)
    status = Column(String, nullable=False)
    summary = Column(String, nullable=False)
    target_devices = Column(Text, nullable=False) # JSON list of device IDs
    results = Column(Text, nullable=False) # JSON list of result objects

class WriteToken(Base):
    __tablename__ = "write_tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    token_value = Column(String, unique=True, index=True, nullable=False)
    created_by_admin = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_by = Column(String, nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    used_on_device = Column(String, nullable=True)

class Script(Base):
    __tablename__ = "scripts"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    device_type = Column(String, nullable=True)  # e.g. "cisco_ios", or null = all types
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    cron_expr = Column(String, nullable=False)   # cron syntax e.g. "0 2 * * *"
    task_type = Column(String, nullable=False)   # "backup" or "config_pull"
    device_ids = Column(Text, nullable=False)    # JSON list of device IDs, or '["all"]'
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_run = Column(DateTime(timezone=True), nullable=True)
    last_status = Column(String, nullable=True)  # "success" | "error" | null
