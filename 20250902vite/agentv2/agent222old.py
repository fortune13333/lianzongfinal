#
# ChainTrace Agent V7.5 - Multi-Credential Support
#
import sys
import configparser
import logging
import json
import re
import threading
import datetime
import hashlib
import argparse
import asyncio
from pathlib import Path
# FIX: Added 'cast' import to resolve type assignment errors.
from typing import Dict, List, Any, Optional, Set, cast

from fastapi import FastAPI, HTTPException, Header, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# FIX: Suppressed missing type stubs warnings for the netmiko library.
from netmiko import ConnectHandler # type: ignore
from netmiko.exceptions import NetmikoAuthenticationException, NetmikoBaseException # type: ignore
from netmiko.cisco_base_connection import CiscoBaseConnection # type: ignore


# --- AI Integration Imports ---
try:
    import google.generativeai as genai
except ImportError:
    genai = None


# --- Basic Setup ---

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Command-line Argument Parsing ---
parser = argparse.ArgumentParser(description="ChainTrace Agent: A LAN collaboration server for network configuration tracking.")
parser.add_argument(
    '--config',
    type=Path,
    default=Path("config.ini"),
    help="Path to the configuration file (default: config.ini)"
)
args = parser.parse_args()
CONFIG_FILE = args.config

# --- Data File and Lock ---
DATA_FILE = Path("chaintrace_data.json")
data_lock = threading.Lock()
MAX_LOG_ENTRIES = 1000

# --- In-memory store for active user/device sessions ---
ACTIVE_SESSIONS: Dict[str, List[Dict[str, str]]] = {}
sessions_lock = threading.Lock()


# --- Hashing Helper ---
def _calculate_block_hash(block_data_dict: Dict[str, Any], index: int, timestamp: str, prev_hash: str) -> str:
    """Calculates a deterministic SHA-256 hash for a block's content."""
    # Using separators=(',', ':') and sort_keys=True to match JavaScript's deterministic stringify
    block_content_str = (
        f"{index}{timestamp}"
        f"{json.dumps(block_data_dict, sort_keys=True, separators=(',', ':'), ensure_ascii=False)}"
        f"{prev_hash}"
    )
    return hashlib.sha256(block_content_str.encode('utf-8')).hexdigest()

# --- Initial Data Structure ---
INITIAL_DATA_RAW: Dict[str, Any] = {
    "devices": [
        {"id": "RTR01-NYC", "name": "Core Router NYC", "ipAddress": "192.168.1.1", "type": "Router"},
        {"id": "SW01-SFO", "name": "Access Switch SFO", "ipAddress": "10.10.5.254", "type": "Switch"},
        {"id": "FW01-LON", "name": "Edge Firewall London", "ipAddress": "203.0.113.1", "type": "Firewall"},
    ],
    "users": [
        {"id": 1, "username": "admin", "password": "admin", "role": "admin"},
        {"id": 2, "username": "operator1", "password": "password", "role": "operator"},
        {"id": 3, "username": "net_admin", "password": "password123", "role": "operator"},
    ],
    "audit_log": [],
    "templates": [],
    "policies": [],
    "settings": {
        "is_ai_analysis_enabled": True
    },
    "blockchains": {
        "RTR01-NYC": [{
            "index": 0, "timestamp": "2023-01-01T10:00:00Z",
            "data": { "deviceId": "RTR01-NYC", "version": 1, "operator": "system_init", "config": "hostname RTR01-NYC\n!\ninterface GigabitEthernet0/0\n ip address 192.168.1.1 255.255.255.0\n no shutdown\n!\nrouter ospf 1\n network 192.168.1.0 0.0.0.255 area 0\n!\nend", "diff": "+ hostname RTR01-NYC\n+ !\n+ interface GigabitEthernet0/0\n+  ip address 192.168.1.1 255.255.255.0\n+  no shutdown\n+ !\n+ router ospf 1\n+  network 192.168.1.0 0.0.0.255 area 0\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"
        }],
        "SW01-SFO": [{
            "index": 0, "timestamp": "2023-01-02T11:30:00Z",
            "data": { "deviceId": "SW01-SFO", "version": 1, "operator": "system_init", "config": "hostname SW01-SFO\n!\nvlan 10\n name USERS\n!\ninterface FastEthernet0/1\n switchport mode access\n switchport access vlan 10\n!\nend", "diff": "+ hostname SW01-SFO\n+ !\n+ vlan 10\n+  name USERS\n+ !\n+ interface FastEthernet0/1\n+  switchport mode access\n+  switchport access vlan 10\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"
        }],
        "FW01-LON": [{
            "index": 0, "timestamp": "2023-01-03T09:00:00Z",
            "data": { "deviceId": "FW01-LON", "version": 1, "operator": "system_init", "config": "hostname FW01-LON\n!\nip access-list extended INCOMING_FILTER\n permit tcp any host 203.0.113.1 eq 443\n deny ip any any log\n!\ninterface GigabitEthernet0/1\n ip access-group INCOMING_FILTER in\n!\nend", "diff": "+ hostname FW01-LON\n+ !\n+ ip access-list extended INCOMING_FILTER\n+  permit tcp any host 203.0.113.1 eq 443\n+  deny ip any any log\n+ !\n+ interface GigabitEthernet0/1\n+  ip access-group INCOMING_FILTER in\n+ !\n+ end", "changeType": "initial", "summary": "初始系统配置。", "analysis": "这是设备的第一个配置区块，用于建立基线。", "security_risks": "无。这是一个标准的初始设置。", "compliance_report": {"overall_status": "passed", "results": []}}, "prev_hash": "0"
        }]
    }
}

def get_initial_data_with_hashes() -> Dict[str, Any]:
    """Calculates initial hashes for the default dataset."""
    data = json.loads(json.dumps(INITIAL_DATA_RAW)) # Deep copy
    for chain in data["blockchains"].values():
        for block in chain:
            block["hash"] = _calculate_block_hash(block["data"], block["index"], block["timestamp"], block["prev_hash"])
    return data

INITIAL_DATA = get_initial_data_with_hashes()

# --- Data Handling Functions ---

def log_action(data: Dict[str, Any], username: str, action: str) -> None:
    log_entry: Dict[str, str] = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'), "username": username, "action": action}
    audit_log: List[Dict[str, str]] = data.get("audit_log", [])
    audit_log.insert(0, log_entry)
    data["audit_log"] = audit_log[:MAX_LOG_ENTRIES]

def _save_data_nolock(data: Dict[str, Any]) -> None:
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f: json.dump(data, f, indent=2, ensure_ascii=False)
    except IOError as e: logging.error(f"Could not write to {DATA_FILE}: {e}")

def _load_data_nolock() -> Dict[str, Any]:
    if not DATA_FILE.exists():
        logging.info(f"{DATA_FILE} not found. Creating with initial data."); _save_data_nolock(INITIAL_DATA); return INITIAL_DATA
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Ensure backward compatibility for older data files
            if 'users' not in data: data['users'] = INITIAL_DATA['users']
            if 'audit_log' not in data: data['audit_log'] = []
            if 'templates' not in data: data['templates'] = []
            if 'policies' not in data: data['policies'] = []
            if 'settings' not in data: data['settings'] = {"is_ai_analysis_enabled": True}
            return data
    except (json.JSONDecodeError, IOError) as e:
        logging.error(f"Error reading {DATA_FILE}: {e}. Returning empty structure."); return {"devices": [], "blockchains": {}, "users": [], "audit_log": [], "templates": [], "policies": [], "settings": {"is_ai_analysis_enabled": True}}


# --- Configuration Loading ---
config = configparser.ConfigParser()
forbidden_commands: Set[str] = set()
try:
    if not CONFIG_FILE.exists(): raise FileNotFoundError(f"{CONFIG_FILE} not found.")
    config.read(CONFIG_FILE, encoding='utf-8');
    if not config.sections(): raise FileNotFoundError(f"{CONFIG_FILE} is empty.")
    
    # --- Gemini AI Configuration ---
    if genai:
        GEMINI_API_KEY = config.get('gemini', 'api_key', fallback=None)
        if GEMINI_API_KEY and 'your_gemini_api_key' not in GEMINI_API_KEY:
            try:
                genai.configure(api_key=GEMINI_API_KEY) # type: ignore
                logging.info("Gemini API key loaded and configured successfully.")
            except Exception as e:
                logging.error(f"Failed to configure Gemini API, AI features will be disabled. Error: {e}")
                genai = None
        else:
            logging.warning("Gemini API key not found or is a placeholder in config.ini. AI features will be disabled.")
            genai = None
    else:
        logging.warning("google-generativeai library not found. AI features will be disabled. Please run 'pip install -r requirements.txt'")
    
    # --- Security Configuration ---
    if config.has_section('security'):
        commands_str = config.get('security', 'forbidden_commands', fallback='')
        if commands_str:
            # Normalize commands on load: lowercase, strip whitespace, and collapse internal spaces.
            raw_commands = [cmd.strip().lower() for cmd in commands_str.split(',') if cmd.strip()]
            forbidden_commands = {' '.join(cmd.split()) for cmd in raw_commands}
            logging.info(f"Loaded {len(forbidden_commands)} forbidden commands: {', '.join(sorted(list(forbidden_commands)))}")

except (configparser.Error, FileNotFoundError, UnicodeDecodeError) as e:
    logging.error(f"CRITICAL: An unexpected error occurred while reading {CONFIG_FILE}: {e}"); sys.exit(1)

# --- API Models ---
class Device(BaseModel): id: str; name: str; ipAddress: str; type: str
class ConfigPayload(BaseModel): config: str
class SubmissionPayload(BaseModel): operator: str; config: str
class AuditTriggerPayload(BaseModel): operator: str
class SessionPayload(BaseModel): username: str; sessionId: str
class User(BaseModel): id: int; username: str; password: str; role: str
class UserUpdatePayload(BaseModel): username: str; role: str; password: Optional[str] = None
class ConfigTemplate(BaseModel): id: str; name: str; content: str
class BulkDeployPayload(BaseModel): template_id: str; device_ids: List[str]
class Policy(BaseModel): id: str; name: str; severity: str; description: str; rule: str; enabled: bool
class AISettingsPayload(BaseModel): is_ai_analysis_enabled: bool


# --- FastAPI App Initialization ---
app = FastAPI(title="ChainTrace Local Agent", version="7.5.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Helper & AI Functions ---
def get_device_info(device_id: str) -> Optional[Dict[str, Any]]:
    device_id_upper = device_id.upper()
    if not config.has_option('device_map', device_id_upper):
        return None
    try:
        device_map_parts = [part.strip() for part in config.get('device_map', device_id_upper).split(',')]
        if len(device_map_parts) != 3:
            raise ValueError(f"Device map entry for '{device_id}' is malformed. Expected format: IP, Type, Credentials_Section_Name")

        host, device_type, cred_section = device_map_parts

        if not config.has_section(cred_section):
            raise configparser.NoSectionError(f"Credentials section '{cred_section}' specified for device '{device_id}' not found in config.ini.")
            
        return {
            'host': host,
            'device_type': device_type,
            'username': config.get(cred_section, 'username'),
            'password': config.get(cred_section, 'password'),
            'secret': config.get(cred_section, 'secret', fallback=None),
            'timeout': 15,
        }
    except (configparser.NoSectionError, configparser.NoOptionError, ValueError) as e:
        logging.error(f"Configuration error for device '{device_id}': {e}")
        return None

def is_simulation_mode() -> bool:
    """Checks if any credentials section enables simulation mode."""
    try:
        cred_sections = [s for s in config.sections() if s.lower().startswith('credentials')]
        for section in cred_sections:
            if config.get(section, 'username', fallback='').upper() == 'SIM_USER':
                logging.info(f"Simulation mode is ACTIVE, detected in section '[{section}]'.")
                return True
        return False
    except configparser.Error:
        return False

def _verify_admin(data: Dict[str, Any], username: str) -> None:
    users: List[Dict[str, Any]] = data.get("users", [])
    actor = next((u for u in users if u["username"] == username), None)
    if not actor or actor["role"] != "admin": raise HTTPException(status_code=403, detail="权限不足。需要管理员角色。")

def generate_simple_diff(old: str, new: str) -> str:
    old_lines, new_lines = old.splitlines(), new.splitlines()
    old_set, new_set = set(old_lines), set(new_lines)
    diff: List[str] = []
    
    for line in old_lines:
        if line not in new_set: diff.append(f"- {line}")
    for line in new_lines:
        if line not in old_set: diff.append(f"+ {line}")
        
    return "\n".join(diff) or "No textual changes detected."

def call_gemini_for_analysis(new_config: str, last_config: str) -> Dict[str, Any]:
    if not genai: raise ConnectionError("Gemini AI is not configured or available.")
    model = genai.GenerativeModel('gemini-2.5-flash')  # type: ignore
    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    prompt = f"You are an expert network and security engineer. Analyze the following network device configuration change. Previous Configuration:\n---\n{last_config}\n---\nNew Configuration:\n---\n{new_config}\n---\nYour task is to: 1. Create a simple text-based diff. 2. Write a one-sentence summary in Chinese. 3. Provide a brief analysis in Chinese. 4. Identify any potential security risks in Chinese. Provide the response in this JSON format: {{\"diff\": \"...\", \"summary\": \"...\", \"analysis\": \"...\", \"security_risks\": \"...\"}}. Do not include markdown."
    response = model.generate_content(  # type: ignore
        prompt,
        generation_config={"response_mime_type": "application/json"},
        safety_settings=safety_settings,
        request_options={'timeout': 30}
    )
    result: Dict[str, Any] = json.loads(response.text)
    return result

def call_gemini_for_compliance(new_config: str, last_config: str, policies: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not genai: raise ConnectionError("Gemini AI is not configured or available.")
    model = genai.GenerativeModel('gemini-2.5-flash')  # type: ignore
    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    policies_str = "\n".join([f"- ID: {p['id']}, Name: {p['name']}, Rule: {p['rule']}" for p in policies])
    prompt = f"You are a meticulous network compliance auditor. Check the proposed configuration against these policies:\n---\n{policies_str}\n---\nPrevious Configuration (for context):\n{last_config}\n---\nNew Configuration (to be audited):\n{new_config}\n---\nYour Task: For each policy, evaluate if the 'New Configuration' violates it. Respond with a single JSON object. The JSON must have 'overall_status' ('passed' or 'failed') and 'results' (an array of objects, one for each policy, with 'policy_id', 'policy_name', 'status' ['passed', 'failed', 'not_applicable'], and 'details' in Chinese)."
    response = model.generate_content(  # type: ignore
        prompt,
        generation_config={"response_mime_type": "application/json"},
        safety_settings=safety_settings,
        request_options={'timeout': 30}
    )
    result: Dict[str, Any] = json.loads(response.text)
    return result


def _perform_add_block(data: Dict[str, Any], device_id: str, payload: SubmissionPayload) -> Dict[str, Any]:
    if device_id not in data['blockchains'] or not data['blockchains'][device_id]:
        raise HTTPException(status_code=404, detail=f"未找到设备 '{device_id}' 的区块链或其为空。")
    
    chain: List[Dict[str, Any]] = data['blockchains'][device_id]
    last_block = chain[-1]
    last_config = last_block['data']['config']
    
    is_ai_globally_enabled = data.get("settings", {}).get("is_ai_analysis_enabled", True)
    compliance_report: Optional[Dict[str, Any]] = None
    active_policies: List[Dict[str, Any]] = [p for p in data.get("policies", []) if p.get("enabled", True)]

    if active_policies and genai and is_ai_globally_enabled:
        try:
            compliance_report = call_gemini_for_compliance(payload.config, last_config, active_policies)
        except Exception as e:
            error_str = str(e).lower()
            if "deadline exceeded" in error_str or "timeout" in error_str:
                detail = "无法连接到 Google AI 服务：请求超时。请检查服务器的网络连接、防火墙和代理设置。"
                logging.error(f"AI compliance check failed: {detail}")
                raise HTTPException(status_code=504, detail=detail)
            elif "user location is not supported" in error_str:
                detail = "Google AI 服务因地理位置限制而不可用。请尝试使用网络代理，或在管理中心暂时禁用后端AI分析以继续操作。"
                logging.error(f"AI compliance check failed due to location: {e}")
                raise HTTPException(status_code=403, detail=detail)
            else:
                detail = f"合规性检查AI调用失败，无法继续: {e}"
                logging.error(f"Critical error during AI compliance check: {e}")
                raise HTTPException(status_code=500, detail=detail)

        if compliance_report and compliance_report.get("overall_status") == "failed":
            first_failure_details = "配置不符合一项或多项已启用的策略。"
            results: List[Dict[str, Any]] = compliance_report.get("results", [])
            for res in results:
                if res.get("status") == "failed":
                    policy_name = res.get('policy_name', '未知策略')
                    details = res.get('details', '无详细信息。')
                    first_failure_details = f"违反策略【{policy_name}】: {details}"
                    break
            logging.warning(f"Compliance check FAILED for device {device_id}. Reason: {first_failure_details}")
            raise HTTPException(status_code=400, detail=f"合规性检查失败。{first_failure_details}")

    try:
        if genai and is_ai_globally_enabled:
            analysis_result = call_gemini_for_analysis(payload.config, last_config)
        else:
            summary = "管理员已禁用后端AI分析。" if not is_ai_globally_enabled else "AI分析已禁用。"
            analysis_result = {"diff": generate_simple_diff(last_config, payload.config), "summary": summary, "analysis": "未进行AI分析。", "security_risks": "未进行AI评估。"}
    except Exception as e:
        logging.error(f"Standard analysis AI call failed: {e}")
        error_str = str(e).lower()
        user_friendly_error: str
        if "deadline exceeded" in error_str or "timeout" in error_str:
            user_friendly_error = "无法连接到 Google AI 服务（请求超时）。请检查服务器的网络连接、防火墙和代理设置。"
        elif "user location is not supported" in error_str:
            user_friendly_error = "由于地理位置限制，Google AI 服务不可用。配置已保存，但缺少AI智能分析。"
        else:
            user_friendly_error = f"AI调用时发生未知错误: {e}"
        analysis_result = {
            "diff": generate_simple_diff(last_config, payload.config), 
            "summary": "AI分析失败", 
            "analysis": user_friendly_error, 
            "security_risks": "无法评估。"
        }
        
    new_block_data: Dict[str, Any] = {"deviceId": device_id, "version": last_block['data']['version'] + 1, "operator": payload.operator, "config": payload.config, "changeType": "update", **analysis_result, "compliance_report": compliance_report}
    new_index = last_block['index'] + 1; prev_hash = last_block['hash']; timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    new_hash = _calculate_block_hash(new_block_data, new_index, timestamp, prev_hash)
    new_block: Dict[str, Any] = {"index": new_index, "timestamp": timestamp, "data": new_block_data, "prev_hash": prev_hash, "hash": new_hash}
    chain.append(new_block)
    return new_block

# --- Interactive Console WebSocket Endpoint ---

async def unified_io_handler(websocket: WebSocket, net_connect: CiscoBaseConnection, actor_username: str):
    """
    A unified I/O handler that multiplexes reads from the user's WebSocket and the device's channel.
    This approach restores full interactivity (like tab-completion) while preserving the ability
    to intercept and validate commands before execution.
    """
    line_buffer: str = ""
    loop = asyncio.get_running_loop()

    ws_reader: asyncio.Task[str] = asyncio.create_task(websocket.receive_text())
    device_reader: asyncio.Future[str] = loop.run_in_executor(None, net_connect.read_channel)

    try:
        while True:
            done, _ = await asyncio.wait(
                [ws_reader, device_reader],
                return_when=asyncio.FIRST_COMPLETED
            )

            # --- Handle output from the device ---
            if device_reader in done:
                device_output: str = device_reader.result()
                if device_output:
                    await websocket.send_text(device_output)
                device_reader = loop.run_in_executor(None, net_connect.read_channel)

            # --- Handle input from the user ---
            if ws_reader in done:
                user_input: str = ws_reader.result()
                
                is_enter_key = '\r' in user_input or '\n' in user_input

                if is_enter_key:
                    command_to_check = line_buffer.strip().lower()
                    normalized_command = ' '.join(command_to_check.split())
                    
                    logging.info(f"Intercept check: User='{actor_username}', Buffer='{line_buffer.strip()}', Normalized='{normalized_command}'")
                    
                    is_forbidden = False
                    if normalized_command:
                        # Check if the user's command is a prefix of any forbidden command
                        # This correctly handles abbreviations like `wr` for `write memory`.
                        if any(cmd.startswith(normalized_command) for cmd in forbidden_commands):
                            is_forbidden = True
                    
                    if is_forbidden:
                        logging.warning(f"User '{actor_username}' attempted forbidden command: '{line_buffer.strip()}' (Normalized: '{normalized_command}')")
                        error_msg = (
                            f"\r\n\x1b[31m[ChainTrace Policy Violation] Error: The command '{line_buffer.strip()}' "
                            f"is prohibited.\r\nPlease use \"Save Session & Audit\" to record changes.\x1b[0m\r\n"
                        )
                        await websocket.send_text(error_msg)
                        
                        # FINAL FIX: Use the "kill line" control character (Ctrl+U) for a more robust erase.
                        # This is a single, standard signal to clear the line buffer, making it more
                        # reliable across different terminals than sending N backspaces.
                        clear_line_signal = '\x15'
                        await loop.run_in_executor(None, net_connect.write_channel, clear_line_signal + '\n')
                    else:
                        # If the command is not forbidden, send a newline to execute it.
                        await loop.run_in_executor(None, net_connect.write_channel, '\n')
                    
                    line_buffer = ""
                
                elif user_input == '\x7f': # Backspace
                    if line_buffer:
                        line_buffer = line_buffer[:-1]
                    await loop.run_in_executor(None, net_connect.write_channel, '\x7f')
                
                else: # Other characters (including Tab)
                    line_buffer += user_input
                    await loop.run_in_executor(None, net_connect.write_channel, user_input)

                ws_reader = asyncio.create_task(websocket.receive_text())

    except WebSocketDisconnect:
        logging.info(f"WebSocket disconnected for user {actor_username}.")
    except Exception as e:
        logging.error(f"Error in unified_io_handler for user {actor_username}: {e}")
    finally:
        if not ws_reader.done(): ws_reader.cancel()
        if not device_reader.done(): device_reader.cancel()


@app.websocket("/ws/{device_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str, session_id: str):
    actor_username = websocket.headers.get("X-Actor-Username", "unknown_ws_user")
    
    await websocket.accept()
    device_info = get_device_info(device_id)
    if not device_info:
        await websocket.close(code=1008, reason="在配置文件中未找到设备ID。")
        return
        
    net_connect: Optional[CiscoBaseConnection] = None
    try:
        await websocket.send_text("[1/3] 正在建立SSH连接...\r\n")
        loop = asyncio.get_running_loop()
        
        net_connect = await loop.run_in_executor(None, lambda: ConnectHandler(**device_info)) # type: ignore
        
        await websocket.send_text("[2/3] 连接成功, 正在进入特权模式...\r\n")
        if net_connect: await loop.run_in_executor(None, net_connect.enable)
        await websocket.send_text("[3/3] 特权模式已进入, 正在等待设备响应 (最长5秒)...\r\n")
        
        prompt = ""
        if net_connect: prompt = await loop.run_in_executor(None, lambda: net_connect.find_prompt(delay_factor=2))
        await websocket.send_text(f"\r\n{prompt}")

        if net_connect:
            await unified_io_handler(websocket, net_connect, actor_username)

    except NetmikoBaseException as e:
        error_type = "认证失败" if isinstance(e, NetmikoAuthenticationException) else "连接超时或错误"
        logging.error(f"WS connection failed for {device_id}: {error_type}: {e}")
        await websocket.send_text(f"\r\n--- 连接失败 ---\r\n原因: {error_type}: {e}\r\n")
    except Exception as e:
        logging.error(f"An unexpected WebSocket error occurred for device {device_id}: {e}")
        await websocket.send_text(f"\r\n--- 连接失败 ---\r\n原因: 未知连接错误: {e}\r\n")
    finally:
        if net_connect and net_connect.is_alive():
            net_connect.disconnect()
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
        logging.info(f"WebSocket connection closed for device {device_id}, session {session_id}")

# --- API Endpoints ---
@app.get("/api/data")
def get_all_data() -> Dict[str, Any]:
    with data_lock:
        data = _load_data_nolock()
        # Enrich device data with netmiko type from config.ini
        enriched_devices = []
        for device_dict in data.get('devices', []):
            device_id_upper = device_dict.get('id', '').upper()
            netmiko_type: Optional[str] = None
            if config.has_option('device_map', device_id_upper):
                try:
                    # Split only once on the first comma
                    _, device_type_str, _ = config.get('device_map', device_id_upper).split(',', 2)
                    netmiko_type = device_type_str.strip()
                except ValueError:
                    logging.warning(f"Could not parse netmiko type for {device_id_upper} from config.ini")
            
            enriched_device = device_dict.copy()
            enriched_device['netmiko_device_type'] = netmiko_type
            enriched_devices.append(enriched_device)
        
        response_data = data.copy()
        response_data['devices'] = enriched_devices
        return response_data

@app.post("/api/reset", status_code=204)
def reset_data(actor: str = Header(..., alias="X-Actor-Username")) -> None:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        log_action(data, actor, "重置了所有应用数据到初始状态。"); _save_data_nolock(INITIAL_DATA)
    return

@app.post("/api/devices", status_code=201)
def add_device(device: Device, actor: str = Header(..., alias="X-Actor-Username")) -> Device:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        # FIX: Explicitly type `devices_list` to help Pylance understand that it is a list
        # and resolve the "reportUnknownMemberType" error for the `append` method.
        devices_list: List[Dict[str, Any]] = data['devices']
        if any(d['id'] == device.id for d in devices_list): raise HTTPException(status_code=409, detail=f"设备 ID '{device.id}' 已存在。")
        devices_list.append(device.model_dump())
        genesis_block_data: Dict[str, Any] = {"deviceId": device.id, "version": 1, "operator": "system_init", "config": f"hostname {device.name}\n!\n! Initial configuration created by ChainTrace.", "diff": f"+ hostname {device.name}\n+ !\n+ ! Initial configuration created by ChainTrace.", "changeType": "initial", "summary": "设备已创建。", "analysis": "这是新设备的第一个配置区块...", "security_risks": "无。", "compliance_report": {"overall_status": "passed", "results": []}}
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'); hash_hex = _calculate_block_hash(genesis_block_data, 0, timestamp, "0")
        genesis_block: Dict[str, Any] = {"index": 0, "timestamp": timestamp, "data": genesis_block_data, "prev_hash": "0", "hash": hash_hex}
        data['blockchains'][device.id] = [genesis_block]
        log_action(data, actor, f"添加了新设备 '{device.name}' (ID: {device.id})。"); _save_data_nolock(data)
    return device

@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str, actor: str = Header(..., alias="X-Actor-Username")) -> None:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        device_to_delete = next((d for d in data['devices'] if d['id'] == device_id), None)
        if not device_to_delete: raise HTTPException(status_code=404, detail=f"未找到设备 ID '{device_id}'。")
        data['devices'] = [d for d in data['devices'] if d['id'] != device_id]
        if device_id in data['blockchains']: del data['blockchains'][device_id]
        log_action(data, actor, f"删除了设备 '{device_to_delete['name']}' (ID: {device_id})。"); _save_data_nolock(data)
    return

@app.post("/api/sessions/{device_id}/save", status_code=200)
def save_session_and_audit(device_id: str, payload: AuditTriggerPayload) -> Dict[str, Any]:
    """Fetches the latest config from the device and creates a new block."""
    if is_simulation_mode():
        raise HTTPException(status_code=400, detail="模拟模式下无法保存会话。")
    
    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 ID '{device_id}'。")

    try:
        device_type = device_info.get('device_type', '').lower()
        with ConnectHandler(**device_info) as net_connect:
            net_connect.enable()
            
            # Use Netmiko's built-in, multi-vendor method to disable pagination
            logging.info(f"Disabling pagination for device type: {device_type}")
            net_connect.disable_paging()
            
            # Select the correct command to get the running configuration based on device type
            config_command = 'show running-config'
            if any(vendor in device_type for vendor in ['huawei', 'h3c', 'hp_comware']):
                config_command = 'display current-configuration'
            
            logging.info(f"Executing command '{config_command}' for device {device_id}")
            # Let Netmiko auto-detect the prompt, but provide a generous read_timeout for large configs
            # FIX: Explicitly cast the return value of `send_command` to a string.
            # While it typically returns a string for this command, Netmiko's type hints
            # are broad, so casting resolves the "reportAssignmentType" error.
            latest_config: str = cast(str, net_connect.send_command(config_command, read_timeout=120))
        
        # Now that we have the final config, create a new submission payload
        audit_payload = SubmissionPayload(operator=payload.operator, config=latest_config)
        
        with data_lock:
            data = _load_data_nolock()
            new_block = _perform_add_block(data, device_id, audit_payload)
            log_action(data, payload.operator, f"通过交互式会话为设备 '{device_id}' 保存并审计了新配置 (版本 {new_block['data']['version']})。")
            _save_data_nolock(data)
        
        return new_block

    except NetmikoBaseException as e:
        logging.error(f"Netmiko error during session save for {device_id}: {e}")
        raise HTTPException(status_code=504, detail="从设备获取配置失败：设备响应超时或返回格式不正确。请检查设备状态和网络连接。")
    except Exception as e:
        logging.error(f"Unexpected error during session save for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"保存在线会话时发生意外错误: {e}")

@app.post("/api/device/{device_id}/push_config", status_code=200)
def push_config_to_device(device_id: str, payload: ConfigPayload, actor: str = Header(..., alias="X-Actor-Username")):
    if is_simulation_mode():
        logging.info(f"SIMULATION MODE: Simulating config push for {device_id}.")
        return {"status": "success", "message": "配置推送模拟成功。"}
    
    device_info = get_device_info(device_id)
    if not device_info:
        raise HTTPException(status_code=404, detail=f"在配置文件中未找到设备 ID '{device_id}'。")
    
    config_commands = payload.config.splitlines()
    if not config_commands:
        raise HTTPException(status_code=400, detail="配置内容不能为空。")
    
    try:
        with ConnectHandler(**device_info) as net_connect: # type: ignore
            net_connect.enable() # type: ignore
            output: str = net_connect.send_config_set(config_commands) # type: ignore
        
        with data_lock:
            data = _load_data_nolock()
            log_action(data, actor, f"将配置非交互式地推送到设备 '{device_id}'。")
            _save_data_nolock(data)
            
        return {"status": "success", "output": output}
    except NetmikoBaseException as e:
        logging.error(f"Netmiko error during config push for {device_id}: {e}")
        raise HTTPException(status_code=504, detail="推送配置失败：连接设备时出错。请检查设备状态和网络连接。")
    except Exception as e:
        logging.error(f"Unexpected error during config push for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"推送配置时发生意外错误: {e}")

@app.post("/api/bulk-deploy")
def bulk_deploy_template(payload: BulkDeployPayload, actor: str = Header(..., alias="X-Actor-Username")) -> Dict[str, Any]:
    with data_lock: data = _load_data_nolock()
    
    template = next((t for t in data.get('templates', []) if t['id'] == payload.template_id), None)
    if not template: raise HTTPException(status_code=404, detail="未找到模板。")
    
    success_count = 0
    failures: List[str] = []
    
    for device_id in payload.device_ids:
        device = next((d for d in data.get('devices', []) if d['id'] == device_id), None)
        if not device:
            failures.append(f"{device_id}: 在数据库中未找到设备元数据。")
            continue

        # Render template
        rendered_config = template['content'].replace("{{ device.name }}", device['name'])
        rendered_config = rendered_config.replace("{{ device.id }}", device['id'])
        rendered_config = rendered_config.replace("{{ device.ipAddress }}", device['ipAddress'])
        
        # Push to device
        try:
            device_info = get_device_info(device_id)
            if not device_info: raise Exception("在 config.ini 中未找到设备。")
            
            # Fetch the latest config to use as 'last_config' for a more accurate audit
            if not is_simulation_mode():
                with ConnectHandler(**device_info) as net_connect: # type: ignore
                    net_connect.enable() # type: ignore
                    net_connect.send_config_set(rendered_config.splitlines()) # type: ignore
            
            # Add block to chain
            audit_payload = SubmissionPayload(operator=actor, config=rendered_config)
            new_block = _perform_add_block(data, device_id, audit_payload)
            log_action(data, actor, f"通过批量部署模板 '{template['name']}' 更新了设备 '{device_id}' (版本 {new_block['data']['version']})。")
            success_count += 1
            
        except Exception as e:
            failures.append(f"{device_id} ({device['name']}): {e}")

    _save_data_nolock(data)
    
    message = f"部署完成。{success_count} 台成功，{len(failures)} 台失败。"
    if failures:
        return {"message": message, "success_count": success_count, "failures": failures}
    return {"message": message, "success_count": success_count, "failures": []}

# --- Template & Policy Management ---
@app.post("/api/templates", status_code=201)
def create_template(template: ConfigTemplate, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        if any(t['name'] == template.name for t in data.get('templates', [])):
            raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")
        data.setdefault('templates', []).append(template.model_dump())
        log_action(data, actor, f"创建了新配置模板 '{template.name}'。")
        _save_data_nolock(data)
    return template

@app.put("/api/templates/{template_id}")
def update_template(template_id: str, template: ConfigTemplate, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        templates = data.get('templates', [])
        template_to_update = next((t for t in templates if t['id'] == template_id), None)
        if not template_to_update:
            raise HTTPException(status_code=404, detail="未找到模板。")
        
        # Check for name conflict if name is being changed
        if template_to_update['name'] != template.name and any(t['name'] == template.name for t in templates):
             raise HTTPException(status_code=409, detail=f"名为 '{template.name}' 的模板已存在。")

        template_to_update.update(template.model_dump())
        log_action(data, actor, f"更新了配置模板 '{template.name}'。")
        _save_data_nolock(data)
    return template

@app.delete("/api/templates/{template_id}", status_code=204)
def delete_template(template_id: str, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        templates = data.get('templates', [])
        template_to_delete = next((t for t in templates if t['id'] == template_id), None)
        if not template_to_delete:
            raise HTTPException(status_code=404, detail="未找到模板。")
        data['templates'] = [t for t in templates if t['id'] != template_id]
        log_action(data, actor, f"删除了配置模板 '{template_to_delete['name']}'。")
        _save_data_nolock(data)
    return

@app.post("/api/policies", status_code=201)
def create_policy(policy: Policy, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        if any(p['name'] == policy.name for p in data.get('policies', [])):
            raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")
        data.setdefault('policies', []).append(policy.model_dump())
        log_action(data, actor, f"创建了新合规策略 '{policy.name}'。")
        _save_data_nolock(data)
    return policy

@app.put("/api/policies/{policy_id}")
def update_policy(policy_id: str, policy: Policy, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        policies = data.get('policies', [])
        policy_to_update = next((p for p in policies if p['id'] == policy_id), None)
        if not policy_to_update:
            raise HTTPException(status_code=404, detail="未找到策略。")
        
        if policy_to_update['name'] != policy.name and any(p['name'] == policy.name for p in policies):
             raise HTTPException(status_code=409, detail=f"名为 '{policy.name}' 的策略已存在。")

        policy_to_update.update(policy.model_dump())
        log_action(data, actor, f"更新了合规策略 '{policy.name}'。")
        _save_data_nolock(data)
    return policy

@app.delete("/api/policies/{policy_id}", status_code=204)
def delete_policy(policy_id: str, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        policies = data.get('policies', [])
        policy_to_delete = next((p for p in policies if p['id'] == policy_id), None)
        if not policy_to_delete:
            raise HTTPException(status_code=404, detail="未找到策略。")
        data['policies'] = [p for p in policies if p['id'] != policy_id]
        log_action(data, actor, f"删除了合规策略 '{policy_to_delete['name']}'。")
        _save_data_nolock(data)
    return

@app.put("/api/settings/ai")
def update_ai_settings(payload: AISettingsPayload, actor: str = Header(..., alias="X-Actor-Username")):
    with data_lock:
        data = _load_data_nolock()
        _verify_admin(data, actor)
        data.setdefault('settings', {})['is_ai_analysis_enabled'] = payload.is_ai_analysis_enabled
        action = "启用" if payload.is_ai_analysis_enabled else "禁用"
        log_action(data, actor, f"全局 {action} 了后端AI智能分析功能。")
        _save_data_nolock(data)
    return data['settings']

@app.post("/api/blockchains/{device_id}", status_code=201)
def add_block(device_id: str, payload: SubmissionPayload) -> Dict[str, Any]:
    with data_lock:
        data = _load_data_nolock()
        new_block = _perform_add_block(data, device_id, payload)
        _save_data_nolock(data)
    return new_block

@app.get("/api/health")
def health_check() -> Dict[str, str]: return {"status": "ok", "mode": "simulation" if is_simulation_mode() else "live"}

# --- User & Session Management ---
@app.get("/api/users")
def get_users() -> List[Dict[str, Any]]:
    with data_lock: data = _load_data_nolock(); return data.get("users", [])

@app.post("/api/users", status_code=201)
def create_user(user_payload: UserUpdatePayload, actor: str = Header(..., alias="X-Actor-Username")) -> Dict[str, Any]:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        users: List[Dict[str, Any]] = data.get("users", [])
        if any(u['username'] == user_payload.username for u in users): raise HTTPException(status_code=409, detail="用户名已存在。")
        if not user_payload.password: raise HTTPException(status_code=400, detail="新用户必须设置密码。")
        new_id = max([u['id'] for u in users] or [0]) + 1
        new_user: Dict[str, Any] = {"id": new_id, "username": user_payload.username, "password": user_payload.password, "role": user_payload.role}
        users.append(new_user); data['users'] = users
        log_action(data, actor, f"创建了新用户 '{new_user['username']}'，角色为 '{new_user['role']}'。")
        _save_data_nolock(data); return new_user

@app.put("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdatePayload, actor: str = Header(..., alias="X-Actor-Username")) -> Dict[str, Any]:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        users: List[Dict[str, Any]] = data.get("users", [])
        user_to_update = next((u for u in users if u['id'] == user_id), None)
        if not user_to_update: raise HTTPException(status_code=404, detail="未找到用户。")
        log_message = f"更新了用户 '{payload.username}' (ID: {user_id}) 的信息。"
        user_to_update['username'] = payload.username; user_to_update['role'] = payload.role
        if payload.password: user_to_update['password'] = payload.password; log_message += " 密码已重置。"
        data['users'] = users; log_action(data, actor, log_message); _save_data_nolock(data); return user_to_update

@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, actor: str = Header(..., alias="X-Actor-Username")) -> None:
    with data_lock:
        data = _load_data_nolock(); _verify_admin(data, actor)
        users: List[Dict[str, Any]] = data.get("users", [])
        user_to_delete = next((u for u in users if u['id'] == user_id), None)
        if not user_to_delete: raise HTTPException(status_code=404, detail="未找到用户。")
        data['users'] = [u for u in users if u['id'] != user_id]
        log_action(data, actor, f"删除了用户 '{user_to_delete['username']}' (ID: {user_id})。"); _save_data_nolock(data); return

@app.get("/api/sessions/{device_id}")
def get_device_sessions(device_id: str) -> List[Dict[str, str]]:
    with sessions_lock: return ACTIVE_SESSIONS.get(device_id, [])

@app.post("/api/sessions/{device_id}", status_code=204)
def join_device_session(device_id: str, payload: SessionPayload) -> None:
    with sessions_lock:
        current_sessions = ACTIVE_SESSIONS.get(device_id, []); updated_sessions = [s for s in current_sessions if s['sessionId'] != payload.sessionId]
        updated_sessions.append(payload.model_dump()); ACTIVE_SESSIONS[device_id] = updated_sessions
    return

@app.delete("/api/sessions/{device_id}/{session_id}", status_code=204)
def leave_device_session_endpoint(device_id: str, session_id: str) -> None:
    with sessions_lock:
        if device_id in ACTIVE_SESSIONS:
            ACTIVE_SESSIONS[device_id] = [s for s in ACTIVE_SESSIONS[device_id] if s['sessionId'] != session_id]
            if not ACTIVE_SESSIONS[device_id]: del ACTIVE_SESSIONS[device_id]
    return

if __name__ == "__main__":
    import uvicorn
    with data_lock: _load_data_nolock()
    try:
        host = config.get('server', 'host', fallback='127.0.0.1')
        port = config.getint('server', 'port', fallback=8000)
    except (configparser.Error, ValueError) as e:
        logging.critical(f"CRITICAL: Failed to read [server] configuration from {CONFIG_FILE}. Error: {e}")
        logging.critical("Please ensure the [server] section exists and the 'port' is a valid integer.")
        sys.exit(1)
    logging.info(f"Starting ChainTrace Agent server at http://{host}:{port} using config {CONFIG_FILE}")
    uvicorn.run("agent:app", host=host, port=port, reload=False)