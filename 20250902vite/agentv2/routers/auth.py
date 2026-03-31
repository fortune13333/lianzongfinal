# routers/auth.py - Authentication endpoints.

import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from core import verify_password, create_access_token, LoginPayload
from auth_deps import check_login_rate_limit

router = APIRouter(tags=["auth"])


@router.post("/api/login")
def login_endpoint(
    payload: LoginPayload,
    request: Request,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """登录接口：验证用户名和密码，返回 JWT 访问令牌。"""
    ip = request.client.host if request.client else "unknown"
    if not check_login_rate_limit(ip):
        logging.warning(f"Rate limit exceeded for login from IP: {ip}")
        raise HTTPException(status_code=429, detail="登录尝试过于频繁，请 60 秒后再试。")
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
