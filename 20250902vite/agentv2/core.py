# core.py - Core components for ChainTrace Agent
# Contains configuration loading, data handling, and Pydantic models.

import sys
import configparser
import logging
import json
import threading
import hashlib
import argparse
import re
from pathlib import Path
from typing import Dict, List, Any, Optional, TypedDict, Tuple

from pydantic import BaseModel

# --- Basic Setup ---

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Command-line Argument Parsing ---
parser = argparse.ArgumentParser(description="ChainTrace Agent: A LAN collaboration server for network configuration tracking.")
parser.add_argument(
    '--config',
    type=Path,
    default=Path("config.ini"),
    help="Path to the configuration file (default: config.ini)"
)
# Use parse_known_args to prevent conflicts when running with uvicorn
args, _ = parser.parse_known_args()
CONFIG_FILE = args.config

# --- In-memory store for active user/device sessions (ephemeral, not persisted) ---
# This structure is now consistent for both WebSocket and API usage.
# Key: session_id (str), Value: SessionState dictionary
class SessionState(TypedDict):
    device_id: str
    username: str
    timestamp: float
    is_dirty: bool

ACTIVE_WEB_SESSIONS: Dict[str, SessionState] = {}
sessions_lock = threading.Lock()


# --- Typed Dictionaries for more precise type hinting ---
class ComplianceReportDict(TypedDict, total=False):
    overall_status: str
    results: List[Dict[str, Any]]
    details: Optional[str]

class BlockDataDict(TypedDict):
    deviceId: str
    version: int
    operator: str
    config: str
    diff: str
    changeType: Optional[str]
    summary: str
    analysis: Any # This can be string or dict from old rollback data
    security_risks: Any # This can be string or list
    compliance_report: Optional[ComplianceReportDict]
    compliance_status: Optional[str] # New field: 'passed' or 'failed'
    is_startup_config: Optional[bool] # New field to mark if saved to startup

class BlockDict(TypedDict):
    index: int
    timestamp: str
    data: BlockDataDict
    prev_hash: str
    hash: str


# --- Hashing Helper ---
def calculate_block_hash(block_data_dict: BlockDataDict, index: int, timestamp: str, prev_hash: str) -> str:
    """Calculates a deterministic SHA-256 hash for a block's content."""
    # Using separators=(',', ':') and sort_keys=True to match JavaScript's deterministic stringify
    block_content_str = (
        f"{index}{timestamp}"
        f"{json.dumps(block_data_dict, sort_keys=True, separators=(',', ':'), ensure_ascii=False)}"
        f"{prev_hash}"
    )
    return hashlib.sha256(block_content_str.encode('utf-8')).hexdigest()

# --- Configuration Loading ---
config = configparser.ConfigParser()
# New structure for rich interception rules
INTERCEPTION_RULES: Dict[str, List[Tuple[str, Any]]] = {
    'contains': [],
    'startswith': [],
    'regex': []
}

try:
    if not CONFIG_FILE.exists(): raise FileNotFoundError(f"{CONFIG_FILE} not found.")
    config.read(CONFIG_FILE, encoding='utf-8');
    if not config.sections(): raise FileNotFoundError(f"{CONFIG_FILE} is empty.")
    
    # --- New: Load Interception Rules ---
    if config.has_section('interception_rules'):
        for rule_name, rule_value in config.items('interception_rules'):
            try:
                rule_type, patterns_str = [part.strip() for part in rule_value.split(':', 1)]
                if rule_type not in INTERCEPTION_RULES:
                    logging.warning(f"Skipping rule '{rule_name}': unknown type '{rule_type}'.")
                    continue
                
                patterns = [p.strip().lower() for p in patterns_str.split(',') if p.strip()]
                if not patterns: continue

                if rule_type == 'regex':
                    for pattern in patterns:
                        try:
                            compiled_regex = re.compile(pattern, re.IGNORECASE)
                            INTERCEPTION_RULES[rule_type].append((rule_name, compiled_regex))
                        except re.error as e:
                            logging.error(f"Error compiling regex for rule '{rule_name}': '{pattern}'. Error: {e}. Skipping this pattern.")
                else: # contains, startswith
                    for pattern in patterns:
                        INTERCEPTION_RULES[rule_type].append((rule_name, pattern))

            except ValueError:
                logging.warning(f"Skipping malformed interception rule '{rule_name}': '{rule_value}'. Expected format: 'type: pattern1, pattern2'.")
        
        logging.info("--- Loaded Interception Rules ---")
        for rule_type, rules in INTERCEPTION_RULES.items():
            if rules:
                logging.info(f"  - {rule_type.capitalize()} ({len(rules)} patterns):")
                for name, pattern in rules:
                    logging.info(f"    - Rule '{name}': {pattern if isinstance(pattern, str) else pattern.pattern}")
        logging.info("-------------------------------")


except (configparser.Error, FileNotFoundError, UnicodeDecodeError) as e:
    logging.error(f"CRITICAL: An unexpected error occurred while reading {CONFIG_FILE}: {e}"); sys.exit(1)

# --- API Models ---
class DevicePayload(BaseModel):
    id: str
    name: str
    ipAddress: str
    type: str
    policyIds: Optional[List[str]] = []
    tags: Optional[List[str]] = []  # 前端传来的标签数组

class ConfigPayload(BaseModel): config: str
class SubmissionPayload(BaseModel): 
    operator: str
    config: str
    changeType: Optional[str] = "update"
class RollbackPayload(BaseModel):
    operator: str
    target_version: int
class AuditTriggerPayload(BaseModel):
    operator: Optional[str] = None
    sessionId: Optional[str] = None
class SessionPayload(BaseModel): username: str; sessionId: str
class User(BaseModel): id: int; username: str; password: str; role: str
class UserUpdatePayload(BaseModel): 
    username: str
    role: str
    password: Optional[str] = None
    extra_permissions: Optional[str] = None
class ConfigTemplate(BaseModel): id: str; name: str; content: str
class BulkDeployPayload(BaseModel): template_id: str; device_ids: List[str]
class Policy(BaseModel): id: str; name: str; severity: str; description: str; rule: str; enabled: bool
class AISettingsPayload(BaseModel): 
    is_ai_analysis_enabled: bool
    auto_audit_ai_analysis_mode: Optional[str] = None

# New model for writing to startup config
class WriteStartupPayload(BaseModel):
    token: str

# New models for proxied AI requests
class AICommandGenerationRequest(BaseModel):
    userInput: str
    device: Dict[str, Any]
    currentConfig: str
    
class AIConfigCheckRequest(BaseModel):
    config: str
    device: Dict[str, Any]
# This model is no longer needed as interception is now fully backend-driven in the WebSocket handler.
# class LiveCommandCheckRequest(BaseModel):
#     command: str

# --- Security: Password Hashing & JWT ---
import secrets as _secrets
import datetime as _datetime
from datetime import timedelta
from passlib.context import CryptContext
from jose import jwt as _jose_jwt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Load JWT config from config.ini [security] section
JWT_ALGORITHM: str = config.get('security', 'jwt_algorithm', fallback='HS256')
JWT_EXPIRE_MINUTES: int = config.getint('security', 'jwt_expire_minutes', fallback=480)
_raw_jwt_key: str = config.get('security', 'jwt_secret_key', fallback='').strip()
if not _raw_jwt_key:
    JWT_SECRET_KEY: str = _secrets.token_hex(32)
    logging.warning("安全警告: JWT_SECRET_KEY 未在 config.ini [security] 中配置，已自动生成随机密钥。服务重启后所有已登录的 Token 将全部失效！建议在 config.ini 中配置固定密钥。")
else:
    JWT_SECRET_KEY = _raw_jwt_key
    logging.info("JWT 密钥已从 config.ini [security] 加载。")

def verify_password(plain: str, hashed: str) -> bool:
    """验证明文密码与 bcrypt 哈希是否匹配。"""
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    """将明文密码哈希为 bcrypt 格式。"""
    return pwd_context.hash(password)

def create_access_token(username: str) -> str:
    """生成包含用户名和过期时间的 JWT 访问令牌。"""
    expire = _datetime.datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return _jose_jwt.encode({"sub": username, "exp": expire}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

class TokenData(BaseModel):
    username: str

class LoginPayload(BaseModel):
    username: str
    password: str