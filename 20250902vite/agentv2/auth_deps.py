# auth_deps.py - Shared FastAPI authentication and authorization dependencies.
# Extracted from api_routes.py so all routers can import from one place.

import logging
import secrets
import time
from collections import defaultdict
from typing import Dict

from fastapi import HTTPException, Header, Depends
from sqlalchemy.orm import Session
from jose import JWTError, jwt as jose_jwt

import crud
import models
from database import get_db
from core import JWT_SECRET_KEY, JWT_ALGORITHM, get_password_hash

# --- Login Rate Limiter ---
# NOTE: This is an in-memory, process-local rate limiter.
# In a multi-worker deployment (e.g., uvicorn --workers N > 1), each worker
# maintains its own _login_attempts dict. An attacker can bypass the limit by
# distributing requests across workers (effective limit = N * _RATE_LIMIT_MAX).
# For production multi-worker deployments, replace this with a shared store
# (e.g., Redis via redis-py) to enforce the limit globally across all workers.
_login_attempts: Dict[str, list] = defaultdict(list)
_RATE_LIMIT_MAX: int = 5
_RATE_LIMIT_WINDOW: int = 60  # seconds


def check_login_rate_limit(ip: str) -> bool:
    """Returns True if the IP is allowed to attempt login, False if rate-limited."""
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    if attempts:
        _login_attempts[ip] = attempts
    elif ip in _login_attempts:
        del _login_attempts[ip]
    if len(attempts) >= _RATE_LIMIT_MAX:
        return False
    _login_attempts[ip].append(now)
    return True


def extract_actor_from_jwt(authorization: str, db: Session) -> str:
    """Validates a Bearer JWT and returns the authenticated username."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="认证失败：请在请求头中提供 Bearer 令牌。")
    token = authorization[7:]
    try:
        payload = jose_jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub", "")
        if not username:
            raise JWTError("missing sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="认证失败：令牌无效或已过期，请重新登录。")
    if not crud.get_user_by_username(db, username):
        raise HTTPException(status_code=401, detail="认证失败：用户不存在。")
    return username


def get_current_actor(
    authorization: str = Header(..., alias="Authorization"),
    db: Session = Depends(get_db)
) -> str:
    """Generic JWT auth dependency — verifies identity only, no permission check."""
    return extract_actor_from_jwt(authorization, db)


def verify_ldap_credentials(username: str, password: str, ldap_cfg: dict) -> bool:
    """Verify username/password against an LDAP/AD server. Returns True on success."""
    try:
        from ldap3 import Server, Connection, ALL
        server = Server(
            ldap_cfg.get("server", ""),
            port=int(ldap_cfg.get("port", 389)),
            use_ssl=bool(ldap_cfg.get("use_ssl", False)),
            get_info=ALL,
        )
        # Step 1: bind with service account to search for the user's DN
        bind_conn = Connection(
            server,
            user=ldap_cfg.get("bind_dn", ""),
            password=ldap_cfg.get("bind_password", ""),
            auto_bind=True,
        )
        search_filter = ldap_cfg.get(
            "user_search_filter", "(sAMAccountName={username})"
        ).format(username=username)
        bind_conn.search(ldap_cfg.get("base_dn", ""), search_filter, attributes=["distinguishedName"])
        if not bind_conn.entries:
            logging.warning(f"LDAP: 未找到用户 '{username}'")
            return False
        user_dn = bind_conn.entries[0].entry_dn
        # Step 2: re-bind with the user's own credentials to verify password
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        return user_conn.bound
    except Exception as e:
        logging.warning(f"LDAP 认证失败 for '{username}': {e}")
        return False


def get_or_create_ldap_user(db: Session, username: str) -> models.User:
    """After successful LDAP auth, ensure a local user record exists (auto-created as operator)."""
    user = crud.get_user_by_username(db, username)
    if not user:
        user = models.User(
            username=username,
            password=get_password_hash(secrets.token_hex(32)),  # unusable random password
            role="operator",
            extra_permissions="",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logging.info(f"自动创建 LDAP 用户本地记录: {username}")
    return user


def require_permission(required_permission: str):
    """
    Dependency factory that requires a specific atomic permission.
    - Admins bypass all permission checks.
    - Operators must have the required permission in their extra_permissions field.
    Usage: actor: str = require_permission("device:create")
    """
    def dependency(
        authorization: str = Header(..., alias="Authorization"),
        db: Session = Depends(get_db)
    ) -> str:
        actor = extract_actor_from_jwt(authorization, db)
        user = crud.get_user_by_username(db, actor)
        if not user:
            raise HTTPException(status_code=401, detail="认证失败：用户不存在。")
        if user.role == "admin":
            return actor
        user_permissions = set((user.extra_permissions or "").split(','))
        if required_permission not in user_permissions:
            logging.warning(
                f"Authorization failed for operator '{actor}'. "
                f"Required permission '{required_permission}' not found."
            )
            raise HTTPException(status_code=403, detail=f"权限不足：需要 '{required_permission}' 权限。")
        return actor
    return Depends(dependency)
