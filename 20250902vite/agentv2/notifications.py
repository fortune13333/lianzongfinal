# notifications.py - Alert delivery service for ChainTrace.
# Supports email (SMTP), WeChat Work webhook, and DingTalk webhook channels.

import json
import logging
import smtplib
import ssl
import time
import hmac
import hashlib
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

logger = logging.getLogger(__name__)


def send_email_notification(config: Dict[str, Any], title: str, message: str) -> bool:
    """Send an email notification via SMTP_SSL.

    Expected config keys: smtp_host, smtp_port, sender_email, sender_password,
                          recipient_emails (comma-separated string).
    """
    smtp_host = config.get("smtp_host", "").strip()
    smtp_port = int(config.get("smtp_port", 465))
    sender = config.get("sender_email", "").strip()
    password = config.get("sender_password", "")
    recipients = [r.strip() for r in config.get("recipient_emails", "").split(",") if r.strip()]

    if not all([smtp_host, sender, password, recipients]):
        logger.warning("Email notification skipped: incomplete SMTP configuration.")
        return False

    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = f"[链踪 ChainTrace] {title}"

    body = f"""\
链踪系统告警通知
==================
{message}

---
此邮件由链踪 ChainTrace 自动发送，请勿回复。
"""
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx, timeout=15) as server:
            server.login(sender, password)
            server.sendmail(sender, recipients, msg.as_string())
        logger.info(f"Email sent to {recipients}: {title}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email notification: {e}")
        return False


def send_wechat_work_notification(config: Dict[str, Any], title: str, message: str) -> bool:
    """Send a notification via WeChat Work (企业微信) webhook.

    Expected config keys: webhook_url.
    """
    webhook_url = config.get("webhook_url", "").strip()
    if not webhook_url:
        logger.warning("WeChat Work notification skipped: no webhook_url configured.")
        return False

    payload = {
        "msgtype": "markdown",
        "markdown": {
            "content": f"## {title}\n{message}\n\n> 链踪 ChainTrace 自动发送"
        }
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    try:
        req = Request(webhook_url, data=data, headers={"Content-Type": "application/json"})
        urlopen(req, timeout=10)
        logger.info(f"WeChat Work notification sent: {title}")
        return True
    except Exception as e:
        logger.error(f"Failed to send WeChat Work notification: {e}")
        return False


def send_dingtalk_notification(config: Dict[str, Any], title: str, message: str) -> bool:
    """Send a notification via DingTalk (钉钉) webhook.

    Expected config keys: webhook_url, secret (optional, for HMAC signature).
    """
    webhook_url = config.get("webhook_url", "").strip()
    if not webhook_url:
        logger.warning("DingTalk notification skipped: no webhook_url configured.")
        return False

    # If secret is configured, add HMAC-signed timestamp+sign to the URL
    secret = config.get("secret", "").strip()
    if secret:
        timestamp = str(round(time.time() * 1000))
        string_to_sign = f"{timestamp}\n{secret}"
        hmac_code = hmac.new(
            secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            digestmod=hashlib.sha256,
        )
        sign = base64.b64encode(hmac_code.digest()).decode()
        separator = "&" if "?" in webhook_url else "?"
        webhook_url = f"{webhook_url}{separator}timestamp={timestamp}&sign={sign}"

    payload = {
        "msgtype": "markdown",
        "markdown": {
            "title": title,
            "text": f"## {title}\n{message}\n\n> 链踪 ChainTrace 自动发送"
        }
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    try:
        req = Request(webhook_url, data=data, headers={"Content-Type": "application/json"})
        urlopen(req, timeout=10)
        logger.info(f"DingTalk notification sent: {title}")
        return True
    except Exception as e:
        logger.error(f"Failed to send DingTalk notification: {e}")
        return False


CHANNEL_DISPATCH = {
    "email": send_email_notification,
    "wechat_work": send_wechat_work_notification,
    "dingtalk": send_dingtalk_notification,
}


def deliver_notification(rule, title: str, message: str, db) -> bool:
    """Dispatch a notification through the configured channel and record an Alert.

    Returns True if the notification was sent successfully.
    """
    import crud

    channel = str(rule.channel)
    handler = CHANNEL_DISPATCH.get(channel)
    if handler is None:
        logger.warning(f"Unknown notification channel '{channel}' for rule '{rule.name}'.")
        return False

    try:
        channel_config = json.loads(str(rule.channel_config))
    except (json.JSONDecodeError, TypeError):
        logger.error(f"Invalid channel_config JSON for rule '{rule.name}'.")
        return False

    sent = handler(channel_config, title, message)
    crud.create_alert(
        db,
        rule_id=str(rule.id),
        event_type=str(rule.event_type),
        title=title,
        message=message,
        severity="warning",
        source="scheduler" if "定时" in title else "system",
        is_sent=sent,
    )
    return sent