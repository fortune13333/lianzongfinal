# conftest.py - 测试夹具（Fixtures）配置
# 所有测试文件共用这里的夹具

import sys
import os
import pytest

# 将 agentv2/ 加入 Python 路径，确保能 import 项目模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# 先 import 项目模块（core.py 会读取 config.ini，pytest 必须从 agentv2/ 目录运行）
import models
from database import Base, get_db
import crud
from agent import app

# --- 测试专用内存数据库（不影响真实 chaintrace.db）---
# StaticPool: 所有线程共享同一个连接，确保 TestClient 的异步线程也能看到建好的表
_TEST_DB_URL = "sqlite:///:memory:"
_engine = create_engine(
    _TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _override_get_db():
    """替换 FastAPI 的 get_db 依赖，改为使用内存数据库。"""
    db = _TestingSession()
    try:
        yield db
    finally:
        db.close()


# 覆盖依赖注入：所有 API 请求都用测试数据库
app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    """session 级别的夹具：创建表并植入初始数据，整个测试期间只执行一次。"""
    Base.metadata.create_all(bind=_engine)
    db = _TestingSession()
    crud.seed_initial_data(db)
    crud.migrate_plaintext_passwords(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture(scope="session")
def client():
    """返回 FastAPI TestClient，整个测试期间复用同一个实例。"""
    return TestClient(app)


@pytest.fixture(scope="session")
def admin_token(client, init_test_db):
    """用 admin/admin 登录，返回 JWT token 字符串。"""
    r = client.post("/api/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200, f"admin 登录失败: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def operator_token(client, init_test_db):
    """用 operator1/password 登录，返回 JWT token 字符串。"""
    # 清空登录速率限制记录，防止前面的登录测试耗尽配额导致 429
    from auth_deps import _login_attempts
    _login_attempts.clear()
    r = client.post("/api/login", json={"username": "operator1", "password": "password"})
    assert r.status_code == 200, f"operator1 登录失败: {r.text}"
    return r.json()["access_token"]
