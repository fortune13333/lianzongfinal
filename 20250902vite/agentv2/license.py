# license.py - Offline RSA license verification for ChainTrace.
# Community edition: max 5 devices, no LDAP, no PDF reports.
# Pro/Enterprise edition: controlled by signed .lic file.

import json
import base64
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class LicenseInfo:
    customer: str = "Community"
    max_devices: int = 5
    features: List[str] = field(default_factory=list)
    expires_at: Optional[str] = None
    is_valid: bool = False
    error: str = ""


_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArS2pa0eHbdKkHlHJ0q1h
CFpMVEn3frR4i4E3x2zjJscEIk1PeP4mFhrX15XSPpXFV8+6ueMkH+8e89VvjPNm
D+RZxH2Q9X3mC29sf+3SuHCz0U0kEVmz4L2afyeYdy/XJpHCrcbd9GgiRsmUqbTl
ZSG2RFcgGyklobG7ouJjfOO+H9mjUCcSoyVpkgMEr90TVlptocrWrVjr2s9rDwc8
mt3qvuIVg8WpBstMkdzFd5Km6ZWg1cDBxPKDXssZFV/ZTmxxH7kipL/OY3bpL97O
5ggQamqTZgFq770BxusOH7OZQyKI03EmnPJRsw6n4A8fcATDYYhFbhcV5hfD/R5A
mwIDAQAB
-----END PUBLIC KEY-----"""

_cached: Optional[LicenseInfo] = None


def load_license(license_path: Path = None) -> LicenseInfo:
    """Load and verify the license file. Result is cached for the process lifetime."""
    global _cached
    if _cached is not None:
        return _cached

    if license_path is None:
        license_path = Path(__file__).parent / "chaintrace.lic"

    if not license_path.exists():
        _cached = LicenseInfo(error="未找到 License 文件，以社区版模式运行（最多 5 台设备）。")
        logger.warning(_cached.error)
        return _cached

    try:
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives import hashes, serialization

        raw = json.loads(license_path.read_text(encoding="utf-8"))
        payload_bytes = base64.b64decode(raw["payload"])
        sig_bytes = base64.b64decode(raw["signature"])

        pub_key = serialization.load_pem_public_key(_PUBLIC_KEY_PEM.encode())
        pub_key.verify(sig_bytes, payload_bytes, padding.PKCS1v15(), hashes.SHA256())  # raises on bad sig

        info = json.loads(payload_bytes)

        if info.get("expires_at"):
            exp = datetime.fromisoformat(info["expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                _cached = LicenseInfo(error="License 已过期，请联系销售续期。")
                logger.error(_cached.error)
                return _cached

        _cached = LicenseInfo(
            customer=info.get("customer", ""),
            max_devices=info.get("max_devices", 5),
            features=info.get("features", []),
            expires_at=info.get("expires_at"),
            is_valid=True,
        )
        logger.info(
            f"License 有效 | 客户: {_cached.customer} | "
            f"设备上限: {_cached.max_devices} | "
            f"功能: {_cached.features} | 到期: {_cached.expires_at}"
        )
    except Exception as e:
        _cached = LicenseInfo(error=f"License 验证失败: {e}")
        logger.error(_cached.error)

    return _cached


def reset_cache() -> None:
    """Force reload on next call. Useful for testing."""
    global _cached
    _cached = None


def check_feature(feature: str) -> bool:
    """Return True if the current license includes the given feature."""
    return load_license().is_valid and feature in load_license().features


def get_device_limit() -> int:
    """Return the maximum number of devices allowed by the current license."""
    return load_license().max_devices
