# test_api.py - 集成测试（T05~T08）
# 启动 FastAPI TestClient，测试真实 HTTP 端点（使用内存数据库）

import pytest


# ─────────────────────────────────────────────────────────
# T05：登录接口
# ─────────────────────────────────────────────────────────

class TestLogin:
    """T05 - 验证 POST /api/login 的行为"""

    def test_correct_credentials_returns_token(self, client):
        """正确账号密码返回 200 和 access_token"""
        r = client.post("/api/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["user"]["username"] == "admin"
        assert body["user"]["role"] == "admin"

    def test_wrong_password_returns_401(self, client):
        """错误密码返回 401"""
        r = client.post("/api/login", json={"username": "admin", "password": "wrongpassword"})
        assert r.status_code == 401

    def test_nonexistent_user_returns_401(self, client):
        """不存在的用户名返回 401"""
        r = client.post("/api/login", json={"username": "ghost", "password": "anything"})
        assert r.status_code == 401

    def test_operator_login_works(self, client):
        """operator1 也能正常登录"""
        r = client.post("/api/login", json={"username": "operator1", "password": "password"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "operator"

    def test_missing_fields_returns_422(self, client):
        """缺少必填字段返回 422"""
        r = client.post("/api/login", json={"username": "admin"})
        assert r.status_code == 422


# ─────────────────────────────────────────────────────────
# T06：设备增删改查（需要 admin 权限）
# ─────────────────────────────────────────────────────────

class TestDeviceCRUD:
    """T06 - 验证设备的完整 CRUD 操作（admin token）"""

    TEST_DEVICE = {
        "id": "TEST-DEVICE-001",
        "name": "测试路由器",
        "ipAddress": "192.168.99.1",
        "type": "Router",
        "policyIds": [],
        "tags": ["test", "ci"]
    }

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_create_device(self, client, admin_token):
        """admin 可以创建新设备，返回 201"""
        r = client.post("/api/devices", json=self.TEST_DEVICE, headers=self._auth(admin_token))
        assert r.status_code == 201
        body = r.json()
        assert body["id"] == self.TEST_DEVICE["id"]
        assert body["name"] == self.TEST_DEVICE["name"]

    def test_create_duplicate_device_returns_409(self, client, admin_token):
        """重复创建同 ID 设备返回 409"""
        r = client.post("/api/devices", json=self.TEST_DEVICE, headers=self._auth(admin_token))
        assert r.status_code == 409

    def test_update_device_tags(self, client, admin_token):
        """更新设备标签后，响应中包含最新标签"""
        updated = {**self.TEST_DEVICE, "tags": ["production", "updated"]}
        r = client.put(f"/api/devices/{self.TEST_DEVICE['id']}", json=updated, headers=self._auth(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert "production" in body["tags"]
        assert "updated" in body["tags"]

    def test_update_nonexistent_device_returns_404(self, client, admin_token):
        """更新不存在的设备返回 404"""
        nonexistent = {**self.TEST_DEVICE, "id": "GHOST-999"}
        r = client.put("/api/devices/GHOST-999", json=nonexistent, headers=self._auth(admin_token))
        assert r.status_code == 404

    def test_all_data_contains_new_device(self, client, admin_token):
        """GET /api/data 返回的设备列表中包含刚创建的设备"""
        r = client.get("/api/data", headers=self._auth(admin_token))
        assert r.status_code == 200
        device_ids = [d["id"] for d in r.json()["devices"]]
        assert self.TEST_DEVICE["id"] in device_ids

    def test_delete_device(self, client, admin_token):
        """admin 可以删除设备，返回 204"""
        r = client.delete(f"/api/devices/{self.TEST_DEVICE['id']}", headers=self._auth(admin_token))
        assert r.status_code == 204

    def test_deleted_device_not_in_data(self, client, admin_token):
        """删除后，设备不再出现在 /api/data 中"""
        r = client.get("/api/data", headers=self._auth(admin_token))
        device_ids = [d["id"] for d in r.json()["devices"]]
        assert self.TEST_DEVICE["id"] not in device_ids


# ─────────────────────────────────────────────────────────
# T07：无 Token 访问受保护接口
# ─────────────────────────────────────────────────────────

class TestUnauthenticated:
    """T07 - 验证未提供 Token 时，受保护接口拒绝访问"""

    def test_get_data_without_token_returns_422(self, client):
        """GET /api/data 无 token → 422（Authorization header 为必填）"""
        r = client.get("/api/data")
        assert r.status_code == 422

    def test_post_device_without_token_returns_422(self, client):
        """POST /api/devices 无 token → 422"""
        r = client.post("/api/devices", json={
            "id": "NO-AUTH", "name": "test", "ipAddress": "1.1.1.1", "type": "Router"
        })
        assert r.status_code == 422

    def test_invalid_token_returns_401(self, client):
        """伪造 token → 401"""
        r = client.get("/api/data", headers={"Authorization": "Bearer this.is.fake"})
        assert r.status_code == 401

    def test_health_endpoint_is_public(self, client):
        """GET /api/health 是公开接口，无需认证"""
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ─────────────────────────────────────────────────────────
# T08：operator 角色权限边界
# ─────────────────────────────────────────────────────────

class TestOperatorPermissions:
    """T08 - 验证 operator 角色无法访问需要 admin 权限的接口"""

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_operator_cannot_create_user(self, client, operator_token):
        """operator 无法创建新用户（需要 user:manage 权限）→ 403"""
        r = client.post("/api/users", json={
            "username": "hacker", "password": "123456", "role": "operator"
        }, headers=self._auth(operator_token))
        assert r.status_code == 403

    def test_operator_cannot_delete_user(self, client, operator_token):
        """operator 无法删除用户 → 403"""
        r = client.delete("/api/users/2", headers=self._auth(operator_token))
        assert r.status_code == 403

    def test_operator_cannot_reset_data(self, client, operator_token):
        """operator 无法重置系统数据（需要 system:reset 权限）→ 403"""
        r = client.post("/api/reset", headers=self._auth(operator_token))
        assert r.status_code == 403

    def test_operator_can_read_data(self, client, operator_token):
        """operator 可以正常读取数据（GET /api/data）→ 200"""
        r = client.get("/api/data", headers=self._auth(operator_token))
        assert r.status_code == 200

    def test_admin_can_create_user(self, client, admin_token):
        """admin 可以创建新用户 → 201（对比验证）"""
        r = client.post("/api/users", json={
            "username": "temp_test_user", "password": "test123", "role": "operator"
        }, headers=self._auth(admin_token))
        assert r.status_code == 201
