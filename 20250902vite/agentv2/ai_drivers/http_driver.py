# ai_drivers/http_driver.py - AI Driver for custom HTTP endpoints
import logging
import httpx
from fastapi import HTTPException
from typing import Dict, List, Any

from core import config

# --- HTTP Driver Configuration ---
try:
    BASE_URL = config.get('ai_provider', 'http_api_base_url')
    ANALYSIS_PATH = config.get('ai_provider', 'http_analysis_path')
    AUDIT_PATH = config.get('ai_provider', 'http_audit_path')
    COMMAND_GENERATION_PATH = config.get('ai_provider', 'http_command_generation_path')
    CONFIG_CHECK_PATH = config.get('ai_provider', 'http_config_check_path')
    API_KEY = config.get('ai_provider', 'http_api_key', fallback=None)

    if not all([BASE_URL, ANALYSIS_PATH, AUDIT_PATH, COMMAND_GENERATION_PATH, CONFIG_CHECK_PATH]):
        raise ValueError("HTTP driver configuration is incomplete in config.ini. All http_*_path variables are required.")
    
    ANALYSIS_URL = f"{BASE_URL.rstrip('/')}{ANALYSIS_PATH}"
    AUDIT_URL = f"{BASE_URL.rstrip('/')}{AUDIT_PATH}"
    COMMAND_GENERATION_URL = f"{BASE_URL.rstrip('/')}{COMMAND_GENERATION_PATH}"
    CONFIG_CHECK_URL = f"{BASE_URL.rstrip('/')}{CONFIG_CHECK_PATH}"
    
    HEADERS: Dict[str, str] = {"Content-Type": "application/json"}
    if API_KEY:
        HEADERS["Authorization"] = f"Bearer {API_KEY}"
        
    logging.info(f"HTTP AI driver initialized. Base URL: {BASE_URL}")
    http_configured = True
except (ValueError, Exception) as e:
    http_configured = False
    logging.error(f"Failed to initialize HTTP AI driver: {e}")

def _call_http_endpoint(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not http_configured:
        raise HTTPException(status_code=503, detail="HTTP AI driver is not configured or failed to initialize.")
    
    try:
        with httpx.Client(headers=HEADERS, timeout=120.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status() # Raises HTTPStatusError for 4xx/5xx responses
            return response.json()
    except httpx.RequestError as e:
        logging.error(f"HTTP request to {url} failed: {e}")
        raise HTTPException(status_code=504, detail=f"无法连接到自定义AI服务: {e}")
    except httpx.HTTPStatusError as e:
        logging.error(f"HTTP endpoint {url} returned an error: {e.response.status_code} {e.response.text}")
        detail = e.response.text
        try:
            detail = e.response.json().get("detail", e.response.text)
        except Exception:
            pass # Keep original text if not JSON
        raise HTTPException(status_code=e.response.status_code, detail=f"自定义AI服务返回错误: {detail}")

def analyze_changes(previous_config: str, new_config: str, change_description: str) -> Dict[str, Any]:
    """
    Sends data to the custom analysis endpoint.
    """
    payload = {
        "previousConfig": previous_config,
        "newConfig": new_config,
        "changeDescription": change_description
    }
    return _call_http_endpoint(ANALYSIS_URL, payload)

def audit_compliance(policies: List[Dict[str, Any]], previous_config: str, new_config: str) -> Dict[str, Any]:
    """
    Sends data to the custom audit endpoint and enforces compliance failure.
    """
    payload = {
        "policies": policies,
        "previousConfig": previous_config,
        "newConfig": new_config
    }
    report = _call_http_endpoint(AUDIT_URL, payload)
    
    # The decision to block is now moved to the service layer.
    # This driver's responsibility is only to return the audit result.
    return report

# --- New Functions for Frontend AI Tools ---
def generate_commands(user_input: str, device: Dict[str, Any], current_config: str, syntax_type: str) -> str:
    """
    Sends data to the custom command generation endpoint.
    """
    payload = {
        "userInput": user_input,
        "device": device,
        "currentConfig": current_config,
        "syntaxType": syntax_type
    }
    response = _call_http_endpoint(COMMAND_GENERATION_URL, payload)
    return response.get("commands", "")

def check_configuration(config: str, device: Dict[str, Any], syntax_type: str) -> str:
    """
    Sends data to the custom configuration check endpoint.
    """
    payload = {
        "config": config,
        "device": device,
        "syntaxType": syntax_type
    }
    response = _call_http_endpoint(CONFIG_CHECK_URL, payload)
    return response.get("report", "")