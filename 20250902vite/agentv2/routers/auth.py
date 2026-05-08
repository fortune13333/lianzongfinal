# routers/auth.py - Authentication endpoints.

import json
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from core import verify_password, create_access_token, LoginPayload
from auth_deps import (
    check_login_rate_limit,
    verify_ldap_credentials,
    get_or_create_ldap_user,
)
from license import check_feature

router = APIRouter(tags=["auth"])


@router.post("/api/login")
def login_endpoint(
    payload: LoginPayload,
    request: Request,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """登录接口：支持本地账号和 LDAP/AD 认证，返回 JWT 访问令牌。"""
    ip = request.client.host if request.client else "unknown"
    if not check_login_rate_limit(ip):
        logging.warning(f"Rate limit exceeded for login from IP: {ip}")
        raise HTTPException(status_code=429, detail="登录尝试过于频繁，请 60 秒后再试。")

    # Read LDAP config from settings table
    ldap_cfg_raw = crud.get_setting(db, "ldap_config", "{}")
    try:
        ldap_cfg = json.loads(ldap_cfg_raw)
    except Exception:
        ldap_cfg = {}

    if ldap_cfg.get("enabled"):
        if not check_feature("ldap"):
            raise HTTPException(
                status_code=403,
                detail="LDAP 认证功能需要专业版或企业版 License，请联系销售升级。"
            )
        if not verify_ldap_credentials(payload.username, payload.password, ldap_cfg):
            logging.warning(f"LDAP login failed for '{payload.username}' from {ip}")
            raise HTTPException(status_code=401, detail="LDAP 认证失败：用户名或密码无效。")
        user = get_or_create_ldap_user(db, payload.username)
    else:
        user = crud.get_user_by_username(db, payload.username)
        if not user or not verify_password(payload.password, str(user.password)):
            logging.warning(f"Failed login attempt for username: '{payload.username}' from IP: {ip}")
            raise HTTPException(status_code=401, detail="用户名或密码无效。")

    token = create_access_token(user.username)
    logging.info(f"User '{user.username}' logged in successfully from IP: {ip}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "extra_permissions": user.extra_permissions,
        }
    }
