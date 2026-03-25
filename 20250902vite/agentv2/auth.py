# auth.py - Authentication and authorization logic for JWT.

import logging
from typing import Set
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from core import JWT_ALGORITHM, JWT_SECRET_KEY, TokenData
import crud
import models
from database import get_db

# This defines where the client should send the token.
# It points to our /api/login endpoint.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# --- Atomic Permissions Definitions ---
# This is the single source of truth for all granular permissions in the system.
class ATOMIC_PERMISSIONS:
    DEVICE_CREATE = 'device:create'
    DEVICE_UPDATE = 'device:update'
    DEVICE_DELETE = 'device:delete'
    ROLLBACK_EXECUTE = 'rollback:execute'
    USER_MANAGE = 'user:manage'
    TEMPLATE_MANAGE = 'template:manage'
    POLICY_MANAGE = 'policy:manage'
    SYSTEM_RESET = 'system:reset'
    SYSTEM_SETTINGS = 'system:settings'

# --- JWT & User Retrieval Dependencies ---

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    """
    Decodes the JWT token to get the username, then fetches the user from the database.
    This is the core dependency for all protected endpoints.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except (JWTError, ValidationError) as e:
        logging.warning(f"Token validation failed: {e}")
        raise credentials_exception
    
    user = crud.get_user_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """
    A simple dependency that just returns the user if they are active.
    In the future, we could add a check here for `is_active` flag on the user model.
    """
    # if not current_user.is_active:
    #     raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# --- Permission Checking Dependency Factory ---

def require_permission(permission: str):
    """
    This is a dependency factory. It returns a dependency function that checks
    if the current user has the required permission.
    """
    async def permission_checker(current_user: models.User = Depends(get_current_active_user)) -> models.User:
        # Admins have all permissions implicitly.
        if current_user.role == "admin":
            return current_user

        # For operators, check their extra_permissions.
        user_permissions: Set[str] = set()
        if current_user.extra_permissions:
            user_permissions = set(current_user.extra_permissions.split(','))
        
        if permission not in user_permissions:
            logging.warning(f"Authorization failed for user '{current_user.username}'. Missing permission: '{permission}'")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"操作未授权：缺少 '{permission}' 权限。",
            )
        
        return current_user

    return permission_checker
