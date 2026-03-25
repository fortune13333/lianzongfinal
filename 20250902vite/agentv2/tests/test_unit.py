# test_unit.py - 单元测试（T01~T04）
# 测试纯函数，不依赖数据库或网络

import json
import pytest
from core import get_password_hash, verify_password, calculate_block_hash, BlockDataDict


# ─────────────────────────────────────────────────────────
# T01：密码哈希与验证
# ─────────────────────────────────────────────────────────

class TestPasswordHashing:
    """T01 - 验证 bcrypt 哈希与校验函数的正确性"""

    def test_hash_is_not_plaintext(self):
        """哈希结果不应与明文相同"""
        hashed = get_password_hash("mypassword")
        assert hashed != "mypassword"

    def test_hash_starts_with_bcrypt_prefix(self):
        """bcrypt 哈希必须以 $2b$ 开头"""
        hashed = get_password_hash("mypassword")
        assert hashed.startswith("$2b$")

    def test_correct_password_verifies(self):
        """正确密码通过验证"""
        hashed = get_password_hash("correct_password")
        assert verify_password("correct_password", hashed) is True

    def test_wrong_password_fails(self):
        """错误密码验证失败"""
        hashed = get_password_hash("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_same_password_produces_different_hashes(self):
        """同一密码每次哈希结果不同（bcrypt 使用随机 salt）"""
        h1 = get_password_hash("same_password")
        h2 = get_password_hash("same_password")
        assert h1 != h2

    def test_both_hashes_verify_correctly(self):
        """即使哈希不同，两个哈希都能通过验证"""
        h1 = get_password_hash("same_password")
        h2 = get_password_hash("same_password")
        assert verify_password("same_password", h1) is True
        assert verify_password("same_password", h2) is True


# ─────────────────────────────────────────────────────────
# T02：设备标签（Tags）字符串与列表互转
# ─────────────────────────────────────────────────────────

class TestTagsConversion:
    """T02 - 验证标签在列表与逗号分隔字符串之间的转换逻辑"""

    def _list_to_str(self, tags: list) -> str:
        """模拟 crud.py 中的存储逻辑"""
        return ','.join(tags) if tags else ''

    def _str_to_list(self, tags_str: str) -> list:
        """模拟 api_routes.py 中的解析逻辑"""
        return [t.strip() for t in tags_str.split(',') if t.strip()] if tags_str else []

    def test_list_to_string(self):
        """列表转为逗号分隔字符串"""
        assert self._list_to_str(["production", "core"]) == "production,core"

    def test_string_to_list(self):
        """逗号分隔字符串转为列表"""
        assert self._str_to_list("production,core") == ["production", "core"]

    def test_roundtrip(self):
        """列表 → 字符串 → 列表，结果不变"""
        original = ["production", "core", "beijing"]
        assert self._str_to_list(self._list_to_str(original)) == original

    def test_empty_list(self):
        """空列表存储为空字符串，解析回空列表"""
        assert self._list_to_str([]) == ''
        assert self._str_to_list('') == []

    def test_single_tag(self):
        """单个标签的转换"""
        assert self._str_to_list(self._list_to_str(["production"])) == ["production"]

    def test_strips_whitespace(self):
        """解析时去除多余空格"""
        assert self._str_to_list("production, core , beijing") == ["production", "core", "beijing"]


# ─────────────────────────────────────────────────────────
# T03：区块哈希的确定性（相同输入 → 相同哈希）
# ─────────────────────────────────────────────────────────

class TestBlockHashDeterminism:
    """T03 - 验证 calculate_block_hash 的确定性"""

    SAMPLE_DATA: BlockDataDict = {
        "deviceId": "RTR01-TEST",
        "version": 1,
        "operator": "admin",
        "config": "hostname RTR01-TEST\ninterface GigabitEthernet0/0\n ip address 10.0.0.1 255.255.255.0\n",
        "diff": "+ hostname RTR01-TEST",
        "changeType": "initial",
        "summary": "初始配置",
        "analysis": "无",
        "security_risks": "无",
        "compliance_report": None,
        "compliance_status": "passed",
        "is_startup_config": False,
    }

    def test_same_input_same_hash(self):
        """相同输入产生相同哈希（确定性）"""
        h1 = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "0")
        h2 = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "0")
        assert h1 == h2

    def test_hash_is_sha256_length(self):
        """SHA-256 哈希长度固定为 64 个十六进制字符"""
        h = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "0")
        assert len(h) == 64

    def test_different_index_different_hash(self):
        """index 不同，哈希不同"""
        h1 = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "0")
        h2 = calculate_block_hash(self.SAMPLE_DATA, 1, "2024-01-01T00:00:00Z", "0")
        assert h1 != h2

    def test_different_prev_hash_different_hash(self):
        """prev_hash 不同，哈希不同（链式依赖）"""
        h1 = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "0")
        h2 = calculate_block_hash(self.SAMPLE_DATA, 0, "2024-01-01T00:00:00Z", "abc123")
        assert h1 != h2


# ─────────────────────────────────────────────────────────
# T04：区块链完整性验证
# ─────────────────────────────────────────────────────────

class TestBlockchainIntegrity:
    """T04 - 验证哈希链的完整性检测：正常链通过，篡改链被发现"""

    def _build_chain(self) -> list:
        """构造一个 3 块的合法哈希链，返回区块列表"""
        chain = []

        for i in range(3):
            prev_hash = chain[i - 1]["hash"] if i > 0 else "0"
            timestamp = f"2024-01-0{i+1}T00:00:00Z"
            data: BlockDataDict = {
                "deviceId": "TEST-DEVICE",
                "version": i + 1,
                "operator": "admin",
                "config": f"config version {i + 1}",
                "diff": f"change {i}",
                "changeType": "update" if i > 0 else "initial",
                "summary": f"版本 {i + 1}",
                "analysis": "无",
                "security_risks": "无",
                "compliance_report": None,
                "compliance_status": "passed",
                "is_startup_config": False,
            }
            block_hash = calculate_block_hash(data, i, timestamp, prev_hash)
            chain.append({
                "index": i,
                "timestamp": timestamp,
                "data": data,
                "prev_hash": prev_hash,
                "hash": block_hash,
            })

        return chain

    def _verify_chain(self, chain: list) -> bool:
        """校验哈希链是否完整：每个块的哈希值与记录的哈希值一致，且与下一块的 prev_hash 一致"""
        for i, block in enumerate(chain):
            expected_hash = calculate_block_hash(
                block["data"], block["index"], block["timestamp"], block["prev_hash"]
            )
            if block["hash"] != expected_hash:
                return False
            if i > 0 and block["prev_hash"] != chain[i - 1]["hash"]:
                return False
        return True

    def test_valid_chain_passes(self):
        """正常哈希链验证通过"""
        chain = self._build_chain()
        assert self._verify_chain(chain) is True

    def test_tampered_data_detected(self):
        """篡改区块数据后，验证失败（哈希不匹配）"""
        chain = self._build_chain()
        # 悄悄修改第 0 块的配置内容
        chain[0]["data"]["config"] = "TAMPERED CONFIG"
        assert self._verify_chain(chain) is False

    def test_tampered_hash_detected(self):
        """直接修改存储的哈希值后，验证失败"""
        chain = self._build_chain()
        chain[0]["hash"] = "0" * 64  # 用伪造哈希替换
        assert self._verify_chain(chain) is False

    def test_broken_link_detected(self):
        """破坏链条（prev_hash 与上一块不匹配）后，验证失败"""
        chain = self._build_chain()
        chain[1]["prev_hash"] = "0" * 64  # 断开链条
        assert self._verify_chain(chain) is False
