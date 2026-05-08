#!/usr/bin/env python3
"""
gen_license.py - Developer tool for generating signed ChainTrace license files.

This file is for internal use only and must NOT be distributed with the product.
Keep private_key.pem secure and never commit it to version control.

Usage examples:
  # Generate a new RSA keypair (run once, keep private_key.pem safe):
  python gen_license.py --generate-keypair

  # Issue a Pro license for 50 devices, valid 1 year:
  python gen_license.py --customer "某科技有限公司" --devices 50 --features ldap,pdf_report --days 365

  # Issue an Enterprise license with unlimited devices:
  python gen_license.py --customer "某集团" --devices 9999 --features ldap,pdf_report,notification --days 365
"""

import argparse
import json
import base64
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path


def generate_keypair(out_dir: Path = Path(".")):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    pub_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    (out_dir / "private_key.pem").write_bytes(priv_pem)
    print("✓ 私钥已保存到 private_key.pem — 请妥善保管，不要提交到 git！")
    print("\n将以下公钥嵌入 license.py 的 _PUBLIC_KEY_PEM 变量：\n")
    print(pub_pem.decode())


def sign_license(payload: dict, private_key_path: Path) -> dict:
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization

    private_key = serialization.load_pem_private_key(
        private_key_path.read_bytes(), password=None
    )
    payload_bytes = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sig = private_key.sign(payload_bytes, padding.PKCS1v15(), hashes.SHA256())
    return {
        "payload": base64.b64encode(payload_bytes).decode(),
        "signature": base64.b64encode(sig).decode(),
    }


def main():
    parser = argparse.ArgumentParser(description="ChainTrace License Generator")
    parser.add_argument("--generate-keypair", action="store_true", help="生成新的 RSA 密钥对")
    parser.add_argument("--customer", help="客户名称（中文可用）")
    parser.add_argument("--devices", type=int, default=50, help="最大设备数量（默认 50）")
    parser.add_argument("--features", default="ldap,pdf_report",
                        help="逗号分隔的功能列表，可选: ldap, pdf_report, notification（默认: ldap,pdf_report）")
    parser.add_argument("--days", type=int, default=365, help="有效期（天数，默认 365）")
    parser.add_argument("--key", default="private_key.pem", help="RSA 私钥文件路径")
    parser.add_argument("--out", default="chaintrace.lic", help="输出 License 文件名")
    args = parser.parse_args()

    if args.generate_keypair:
        generate_keypair()
        return

    if not args.customer:
        parser.error("签发 License 时必须提供 --customer 参数")

    key_path = Path(args.key)
    if not key_path.exists():
        print(f"错误：私钥文件 '{key_path}' 不存在。请先运行 --generate-keypair。", file=sys.stderr)
        sys.exit(1)

    payload = {
        "customer": args.customer,
        "max_devices": args.devices,
        "features": [f.strip() for f in args.features.split(",") if f.strip()],
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=args.days)).isoformat(),
    }

    lic = sign_license(payload, key_path)
    out_path = Path(args.out)
    out_path.write_text(json.dumps(lic, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"✓ License 已生成: {out_path.resolve()}")
    print(f"  客户: {payload['customer']}")
    print(f"  设备上限: {payload['max_devices']}")
    print(f"  功能: {payload['features']}")
    print(f"  到期: {payload['expires_at']}")
    print(f"\n将 {out_path} 放到客户的 agentv2/ 目录下即可激活。")


if __name__ == "__main__":
    main()
