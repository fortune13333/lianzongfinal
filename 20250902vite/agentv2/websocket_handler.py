# websocket_handler.py - WebSocket handling for ChainTrace Agent's interactive console

import logging
import asyncio
import threading
import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.websockets import WebSocketState
from netmiko import ConnectHandler # type: ignore
from netmiko.exceptions import NetmikoAuthenticationException, NetmikoBaseException, NetmikoTimeoutException # type: ignore
from netmiko.cisco_base_connection import CiscoBaseConnection # type: ignore
from typing import Optional, TypedDict, List

from sqlalchemy.orm import Session

# Import from our own refac tured modules
from core import ACTIVE_WEB_SESSIONS, sessions_lock, SessionState
from services import get_device_info, perform_auto_audit, check_command_against_rules
from database import get_db
import crud
import models


# Type definition for device information
class DeviceInfo(TypedDict, total=False):
    host: str
    device_type: str
    username: str
    password: str
    secret: Optional[str]
    timeout: int

router = APIRouter()

READ_ONLY_COMMANDS = ['show', 'display', 'dir', 'ping', 'traceroute']

# Regex for ANSI escape sequences (like arrow keys) — defined at module level, before use
ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')


async def unified_io_handler(
    websocket: WebSocket, 
    net_connect: CiscoBaseConnection, 
    actor_username: str, 
    session_id: str,
    db: Session
) -> None:
    """
    A stateful, hybrid I/O handler that provides real-time echo while maintaining
    robust, backend-centric command interception. It correctly handles single keypresses,
    control codes, and multi-line pastes without race conditions.
    """
    line_buffer: str = ""
    loop = asyncio.get_running_loop()
    
    ws_reader: asyncio.Task[str] = asyncio.create_task(websocket.receive_text())
    device_reader: "asyncio.Future[str]" = loop.run_in_executor(None, net_connect.read_channel)
    
    try:
        while True:
            done, _ = await asyncio.wait([ws_reader, device_reader], return_when=asyncio.FIRST_COMPLETED)

            if device_reader in done:
                device_output: str = device_reader.result()
                if device_output: await websocket.send_text(device_output)
                device_reader = loop.run_in_executor(None, net_connect.read_channel)

            if ws_reader in done:
                user_input: str = ws_reader.result()

                # --- HYBRID I/O LOGIC (REGRESSION FIX) ---
                # Split input by newlines to handle pastes and single commands correctly.
                # The regex keeps the delimiters, which is crucial.
                parts = re.split(r'(\r\n|\r|\n)', user_input)

                for part in parts:
                    if part in ('\r', '\n', '\r\n'):
                        if not part: continue # Handles empty strings from split

                        # --- INTERCEPTION POINT ---
                        # A newline signifies a command is ready for execution.
                        command_to_check = line_buffer.strip()
                        violated_rule = check_command_against_rules(command_to_check)

                        if violated_rule:
                            # 1. BLOCK: Erase the line on the device and send a warning.
                            clear_line_signal = '\x15'  # CTRL+U
                            await loop.run_in_executor(None, net_connect.write_channel, clear_line_signal + '\n')
                            
                            error_msg = f"\r\n\x1b[31m[ChainTrace Interception] Command blocked by rule: '{violated_rule}'.\x1b[0m\r\n"
                            await websocket.send_text(error_msg)
                        else:
                            # 2. ALLOW: Send the newline to execute the command on the device.
                            await loop.run_in_executor(None, net_connect.write_channel, part)
                            
                            if command_to_check and not any(command_to_check.startswith(cmd) for cmd in READ_ONLY_COMMANDS):
                                with sessions_lock:
                                    if session_id in ACTIVE_WEB_SESSIONS:
                                        ACTIVE_WEB_SESSIONS[session_id]['is_dirty'] = True
                                        await websocket.send_text('\x01IS_DIRTY\x02')
                        
                        # Reset buffer after a line is processed.
                        line_buffer = ""

                    elif part:
                        # This is a non-newline part (text, control chars, etc.)
                        
                        # 1. Update our internal buffer.
                        # We must simulate backspace locally.
                        for char in part:
                            if char == '\x7f': # backspace
                                line_buffer = line_buffer[:-1]
                            # We don't add ANSI escape codes (like arrow keys) to the buffer
                            elif not ANSI_ESCAPE_RE.match(char):
                                line_buffer += char

                        # 2. Forward this part to the device immediately for real-time echo and interaction.
                        await loop.run_in_executor(None, net_connect.write_channel, part)
                
                # --- END OF HYBRID I/O LOGIC ---
                ws_reader = asyncio.create_task(websocket.receive_text())

    except WebSocketDisconnect:
        logging.info(f"WebSocket disconnected for user {actor_username}.")
    except Exception as e:
        logging.error(f"Error in unified_io_handler for user {actor_username}: {e}")
    finally:
        if not ws_reader.done(): ws_reader.cancel()
        if not device_reader.done(): device_reader.cancel()

@router.websocket("/ws/{device_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str, session_id: str, db: Session = Depends(get_db)) -> None:
    # --- JWT Authentication via first message (token not exposed in URL/logs) ---
    from jose import jwt as jose_jwt, JWTError
    from core import JWT_SECRET_KEY, JWT_ALGORITHM

    await websocket.accept()
    try:
        ws_token = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="认证超时：未在规定时间内收到令牌。")
        return

    try:
        ws_payload = jose_jwt.decode(ws_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        actor_username = ws_payload.get("sub", "")
        if not actor_username:
            raise JWTError("missing sub")
    except JWTError:
        await websocket.close(code=1008, reason="认证失败：WebSocket 令牌无效或已过期。")
        return

    # --- Register Session ---
    with sessions_lock:
        session_state: SessionState = {
            'device_id': device_id, 
            'username': actor_username,
            'timestamp': asyncio.get_running_loop().time(),
            'is_dirty': False
        }
        ACTIVE_WEB_SESSIONS[session_id] = session_state
        logging.info(f"WebSocket session {session_id} for user {actor_username} on device {device_id} registered.")


    device_info: Optional[DeviceInfo] = get_device_info(device_id)  # type: ignore
    if not device_info:
        await websocket.close(code=1008, reason="在配置文件中未找到设备ID。")
        return
        
    net_connect: Optional[CiscoBaseConnection] = None
    loop = asyncio.get_running_loop()
    try:
        await websocket.send_text("[1/3] 正在建立SSH连接...\r\n")

        net_connect = await loop.run_in_executor(None, lambda: ConnectHandler(**device_info)) # type: ignore

        await websocket.send_text("[2/3] 连接成功, 正在进入特权模式...\r\n")
        if net_connect: await loop.run_in_executor(None, net_connect.enable)
        await websocket.send_text("[3/3] 特权模式已进入, 正在等待设备响应 (最长5秒)...\r\n")

        prompt = ""
        if net_connect: prompt = await loop.run_in_executor(None, lambda: net_connect.find_prompt(delay_factor=2))
        await websocket.send_text(f"\r\n{prompt}")

        if net_connect:
            await unified_io_handler(websocket, net_connect, actor_username, session_id, db)

    except WebSocketDisconnect:
        logging.info(f"WebSocket disconnected for device {device_id} during SSH connection setup.")
    except (NetmikoBaseException, NetmikoTimeoutException) as e:
        error_type = "认证失败" if isinstance(e, NetmikoAuthenticationException) else "连接超时或不可达"
        logging.error(f"WS connection failed for {device_id}: {error_type}: {e}")
        try:
            await websocket.send_text(f"\r\n--- 连接失败 ---\r\n原因: {error_type}: {e}\r\n")
        except Exception:
            pass
    except Exception as e:
        err_msg = str(e) or type(e).__name__
        logging.error(f"An unexpected WebSocket error occurred for device {device_id}: {err_msg}")
        try:
            await websocket.send_text(f"\r\n--- 连接失败 ---\r\n原因: 未知连接错误: {err_msg}\r\n")
        except Exception:
            pass
    finally:
        # --- Auto-Audit on Disconnect Logic ---
        session_state_to_check = None
        with sessions_lock:
            if session_id in ACTIVE_WEB_SESSIONS:
                session_state_to_check = ACTIVE_WEB_SESSIONS.pop(session_id)

        if session_state_to_check and session_state_to_check['is_dirty']:
            logging.warning(f"DIRTY session {session_id} for device {device_id} disconnected. Triggering auto-audit.")
            threading.Thread(target=perform_auto_audit, args=(device_id, session_state_to_check['username'])).start()

        if net_connect:
            net_connect.disconnect()

        try:
            if websocket.client_state != WebSocketState.DISCONNECTED:
                await websocket.close()
        except Exception:
            pass
        logging.info(f"WebSocket connection closed for device {device_id}, session {session_id}")