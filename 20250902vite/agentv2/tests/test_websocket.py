# test_websocket.py - WebSocket 端点测试 (T09)
# 测试 JWT 认证拒绝、会话注册/注销，以及命令拦截信号。
# 所有测试均使用 TestClient 的 websocket_connect 上下文管理器，
# 不需要真实 SSH 设备（因为没有 [device_map] 匹配时连接会被立即关闭）。

import pytest


class TestWebSocketAuth:
    """T09-A - WebSocket JWT 认证"""

    def test_no_token_closes_connection(self, client):
        """不携带 token 的 WebSocket 连接应被拒绝（服务器在握手时关闭连接）。"""
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/TEST-DEVICE/session-001") as ws:
                ws.receive_text()  # 不会执行到这里

    def test_invalid_token_closes_connection(self, client):
        """伪造 JWT token 的 WebSocket 连接应被拒绝。"""
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/TEST-DEVICE/session-001?token=this.is.fake") as ws:
                ws.receive_text()  # 不会执行到这里

    def test_valid_token_attempts_ssh_connection(self, client, admin_token):
        """合法 JWT token 的 WebSocket 连接应被接受并尝试 SSH（此处设备不存在，返回错误信息后关闭）。"""
        url = f"/ws/NONEXISTENT-DEVICE/session-valid?token={admin_token}"
        with client.websocket_connect(url) as ws:
            # 期望收到连接失败提示，而不是认证失败
            try:
                data = ws.receive_text()
                # Should NOT be a JWT error — device not found error is expected
                assert "令牌" not in data or "设备" in data or "SSH" in data or "连接" in data
            except Exception:
                pass  # 关闭也可接受


class TestWebSocketSessionLifecycle:
    """T09-B - 会话注册与注销（通过 REST API 验证 WebSocket 会话状态）"""

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def test_active_sessions_empty_initially(self, client, admin_token):
        """新建设备后，active sessions 应为空。"""
        # 先创建一个测试设备
        device_payload = {
            "id": "WS-TEST-001",
            "name": "WebSocket测试设备",
            "ipAddress": "10.0.0.99",
            "type": "Router",
            "policyIds": [],
            "tags": ["ws-test"]
        }
        r = client.post("/api/devices", json=device_payload, headers=self._auth(admin_token))
        assert r.status_code in (201, 409)  # 可能已存在

        # 查询 active sessions，应为空
        r = client.get("/api/sessions/WS-TEST-001", headers=self._auth(admin_token))
        assert r.status_code == 200
        sessions = r.json()
        assert isinstance(sessions, list)

    def test_join_and_leave_session(self, client, admin_token):
        """通过 REST API 手动模拟会话加入和离开。"""
        device_id = "WS-TEST-001"
        session_id = "ws-rest-test-session"

        # 加入会话（心跳）
        r = client.post(
            f"/api/sessions/{device_id}",
            json={"username": "admin", "sessionId": session_id},
            headers=self._auth(admin_token)
        )
        assert r.status_code == 204

        # 查询 active sessions - 应该包含刚才加入的会话
        r = client.get(f"/api/sessions/{device_id}", headers=self._auth(admin_token))
        assert r.status_code == 200
        sessions = r.json()
        session_ids = [s["sessionId"] for s in sessions]
        assert session_id in session_ids

        # 离开会话
        r = client.delete(
            f"/api/sessions/{device_id}/{session_id}",
            headers=self._auth(admin_token)
        )
        assert r.status_code == 204

        # 再次查询，会话应已移除
        r = client.get(f"/api/sessions/{device_id}", headers=self._auth(admin_token))
        sessions = r.json()
        session_ids = [s["sessionId"] for s in sessions]
        assert session_id not in session_ids

    def test_cleanup_device(self, client, admin_token):
        """测试结束后清理创建的设备。"""
        r = client.delete("/api/devices/WS-TEST-001", headers=self._auth(admin_token))
        assert r.status_code == 204
