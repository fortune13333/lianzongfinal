# test_new_features.py - T10：新功能集成测试
# 覆盖脚本管理、定时任务管理、配置全文搜索、全量备份端点

import pytest
import uuid


# ─────────────────────────────────────────────────────────
# T10-A：脚本管理 CRUD
# ─────────────────────────────────────────────────────────

class TestScriptCRUD:
    """T10-A - 验证 /api/scripts 的完整 CRUD 操作"""

    SCRIPT_ID = str(uuid.uuid4())
    SCRIPT = {
        "id": SCRIPT_ID,
        "name": "Test Hostname Script",
        "description": "测试脚本",
        "content": "hostname {{ device.name }}",
        "device_type": "cisco_ios",
    }

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_list_scripts_returns_200(self, client, admin_token):
        """未创建任何脚本时也能返回 200 和空列表"""
        r = client.get("/api/scripts", headers=self._auth(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_script(self, client, admin_token):
        """admin 可以创建脚本，返回 201"""
        r = client.post("/api/scripts", json=self.SCRIPT, headers=self._auth(admin_token))
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == self.SCRIPT["name"]
        assert body["device_type"] == "cisco_ios"

    def test_create_duplicate_script_returns_409(self, client, admin_token):
        """重复名称的脚本返回 409"""
        r = client.post("/api/scripts", json=self.SCRIPT, headers=self._auth(admin_token))
        assert r.status_code == 409

    def test_list_scripts_includes_new_script(self, client, admin_token):
        """创建后列表中包含新脚本"""
        r = client.get("/api/scripts", headers=self._auth(admin_token))
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        assert self.SCRIPT["name"] in names

    def test_update_script(self, client, admin_token):
        """可以更新脚本内容"""
        updated = {**self.SCRIPT, "description": "已更新描述", "content": "hostname updated"}
        r = client.put(f"/api/scripts/{self.SCRIPT_ID}", json=updated, headers=self._auth(admin_token))
        assert r.status_code == 200
        assert r.json()["description"] == "已更新描述"

    def test_update_nonexistent_script_returns_404(self, client, admin_token):
        """更新不存在的脚本返回 404"""
        r = client.put("/api/scripts/ghost-id", json=self.SCRIPT, headers=self._auth(admin_token))
        assert r.status_code == 404

    def test_operator_cannot_create_script(self, client, operator_token):
        """没有 script:manage 权限的 operator 无法创建脚本 → 403"""
        new_script = {**self.SCRIPT, "id": str(uuid.uuid4()), "name": "Unauthorized Script"}
        r = client.post("/api/scripts", json=new_script, headers=self._auth(operator_token))
        assert r.status_code == 403

    def test_delete_script(self, client, admin_token):
        """admin 可以删除脚本，返回 204"""
        r = client.delete(f"/api/scripts/{self.SCRIPT_ID}", headers=self._auth(admin_token))
        assert r.status_code == 204

    def test_deleted_script_not_in_list(self, client, admin_token):
        """删除后脚本不再出现在列表中"""
        r = client.get("/api/scripts", headers=self._auth(admin_token))
        names = [s["name"] for s in r.json()]
        assert self.SCRIPT["name"] not in names


# ─────────────────────────────────────────────────────────
# T10-B：定时任务管理 CRUD
# ─────────────────────────────────────────────────────────

class TestScheduledTaskCRUD:
    """T10-B - 验证 /api/scheduled-tasks 的完整 CRUD 操作"""

    TASK_ID = str(uuid.uuid4())
    TASK = {
        "id": TASK_ID,
        "name": "Daily Backup",
        "description": "每日凌晨备份",
        "cron_expr": "0 2 * * *",
        "task_type": "backup",
        "device_ids": ["RTR01-NYC"],
        "is_enabled": True,
    }

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_list_tasks_returns_200(self, client, admin_token):
        """未创建任务时也能返回 200"""
        r = client.get("/api/scheduled-tasks", headers=self._auth(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_task(self, client, admin_token):
        """admin 可以创建定时任务，返回 201"""
        r = client.post("/api/scheduled-tasks", json=self.TASK, headers=self._auth(admin_token))
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == self.TASK["name"]
        assert body["task_type"] == "backup"
        assert body["device_ids"] == ["RTR01-NYC"]

    def test_list_tasks_includes_new_task(self, client, admin_token):
        """创建后列表中包含新任务"""
        r = client.get("/api/scheduled-tasks", headers=self._auth(admin_token))
        names = [t["name"] for t in r.json()]
        assert self.TASK["name"] in names

    def test_update_task(self, client, admin_token):
        """可以更新定时任务"""
        updated = {**self.TASK, "description": "已更新描述", "cron_expr": "0 3 * * *"}
        r = client.put(f"/api/scheduled-tasks/{self.TASK_ID}", json=updated, headers=self._auth(admin_token))
        assert r.status_code == 200
        assert r.json()["cron_expr"] == "0 3 * * *"

    def test_update_nonexistent_task_returns_404(self, client, admin_token):
        """更新不存在的任务返回 404"""
        r = client.put("/api/scheduled-tasks/ghost-id", json=self.TASK, headers=self._auth(admin_token))
        assert r.status_code == 404

    def test_operator_cannot_create_task(self, client, operator_token):
        """没有 task:manage 权限的 operator 无法创建任务 → 403"""
        new_task = {**self.TASK, "id": str(uuid.uuid4()), "name": "Unauthorized Task"}
        r = client.post("/api/scheduled-tasks", json=new_task, headers=self._auth(operator_token))
        assert r.status_code == 403

    def test_delete_task(self, client, admin_token):
        """admin 可以删除定时任务，返回 204"""
        r = client.delete(f"/api/scheduled-tasks/{self.TASK_ID}", headers=self._auth(admin_token))
        assert r.status_code == 204

    def test_deleted_task_not_in_list(self, client, admin_token):
        """删除后任务不再出现在列表中"""
        r = client.get("/api/scheduled-tasks", headers=self._auth(admin_token))
        names = [t["name"] for t in r.json()]
        assert self.TASK["name"] not in names


# ─────────────────────────────────────────────────────────
# T10-C：配置全文搜索
# ─────────────────────────────────────────────────────────

class TestConfigSearch:
    """T10-C - 验证 GET /api/search 的行为"""

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_search_existing_keyword(self, client, admin_token):
        """搜索种子数据中存在的关键词应返回匹配结果"""
        r = client.get("/api/search?q=hostname", headers=self._auth(admin_token))
        assert r.status_code == 200
        results = r.json()
        assert isinstance(results, list)
        assert len(results) > 0
        # 每个结果应包含必要字段
        for result in results:
            assert "device_id" in result
            assert "block_index" in result
            assert "matched_lines" in result
            assert isinstance(result["matched_lines"], list)

    def test_search_nonexistent_keyword_returns_empty(self, client, admin_token):
        """搜索不存在的关键词返回空列表"""
        r = client.get("/api/search?q=ZZZZZ_nonexistent_xyz", headers=self._auth(admin_token))
        assert r.status_code == 200
        assert r.json() == []

    def test_search_empty_query_returns_empty(self, client, admin_token):
        """空字符串查询返回空列表"""
        r = client.get("/api/search?q=   ", headers=self._auth(admin_token))
        assert r.status_code == 200
        assert r.json() == []

    def test_search_with_device_filter(self, client, admin_token):
        """指定 device_id 只返回该设备的匹配结果"""
        r = client.get("/api/search?q=hostname&device_id=RTR01-NYC", headers=self._auth(admin_token))
        assert r.status_code == 200
        results = r.json()
        for result in results:
            assert result["device_id"] == "RTR01-NYC"

    def test_search_respects_limit(self, client, admin_token):
        """limit 参数生效：返回结果数不超过 limit"""
        r = client.get("/api/search?q=hostname&limit=1", headers=self._auth(admin_token))
        assert r.status_code == 200
        assert len(r.json()) <= 1

    def test_search_without_token_returns_422(self, client):
        """未认证访问搜索接口返回 422"""
        r = client.get("/api/search?q=hostname")
        assert r.status_code == 422


# ─────────────────────────────────────────────────────────
# T10-D：全量备份端点
# ─────────────────────────────────────────────────────────

class TestFullBackup:
    """T10-D - 验证 GET /api/backup 的备份完整性"""

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_backup_returns_200(self, client, admin_token):
        """备份接口返回 200"""
        r = client.get("/api/backup", headers=self._auth(admin_token))
        assert r.status_code == 200

    def test_backup_contains_required_fields(self, client, admin_token):
        """备份数据包含所有必要顶层字段"""
        r = client.get("/api/backup", headers=self._auth(admin_token))
        body = r.json()
        required_fields = [
            "backup_version", "created_at", "created_by",
            "devices", "blockchains", "templates", "policies",
            "scripts", "scheduled_tasks", "audit_log",
        ]
        for field in required_fields:
            assert field in body, f"备份数据缺少字段: {field}"

    def test_backup_version_is_2(self, client, admin_token):
        """备份版本号应为 2.0（包含 scripts/scheduled_tasks）"""
        r = client.get("/api/backup", headers=self._auth(admin_token))
        assert r.json()["backup_version"] == "2.0"

    def test_backup_devices_match_data(self, client, admin_token):
        """备份中的设备列表与 /api/data 一致"""
        backup_r = client.get("/api/backup", headers=self._auth(admin_token))
        data_r = client.get("/api/data", headers=self._auth(admin_token))
        backup_ids = {d["id"] for d in backup_r.json()["devices"]}
        data_ids = {d["id"] for d in data_r.json()["devices"]}
        assert backup_ids == data_ids

    def test_backup_blockchains_contains_all_devices(self, client, admin_token):
        """备份中的 blockchains 字典应覆盖所有设备"""
        r = client.get("/api/backup", headers=self._auth(admin_token))
        body = r.json()
        device_ids = {d["id"] for d in body["devices"]}
        blockchain_ids = set(body["blockchains"].keys())
        assert device_ids == blockchain_ids

    def test_backup_without_token_returns_422(self, client):
        """未认证访问备份接口返回 422"""
        r = client.get("/api/backup")
        assert r.status_code == 422
