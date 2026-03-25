# ai_drivers/spark_driver.py - AI Driver for iFlytek Spark Cognitive Large Model
import logging
import json
import httpx
import re
from fastapi import HTTPException
from typing import Dict, List, Any

from core import config

# --- Spark AI Configuration ---
spark_configured = False
HTTP_API_PASSWORD = ""
APP_ID = ""
MODEL = ""
SPARK_API_URL = "" # Will be constructed dynamically
HEADERS: Dict[str, str] = {}


try:
    HTTP_API_PASSWORD = config.get('spark', 'http_api_password')
    APP_ID = config.get('spark', 'app_id')
    MODEL = config.get('spark', 'model', fallback="generalv3.5")

    # --- DEFENSIVE SELF-CHECK ---
    # This block prevents runtime errors by validating config values at startup.
    if not HTTP_API_PASSWORD or "your" in HTTP_API_PASSWORD or not HTTP_API_PASSWORD.strip():
        raise ValueError("配置错误：`http_api_password` 缺失或为占位符。请从讯飞星火控制台的【http 服务接口认证信息】区域获取一个单独的、完整的APIPassword字符串。")
    
    if not APP_ID or "your" in APP_ID or not APP_ID.strip() or APP_ID == "1":
        raise ValueError(f"配置错误：`app_id` ('{APP_ID}') 缺失或为占位符。请从讯飞星火控制台的【Websocket服务接口认证信息】区域获取您的有效 APPID。")
    # --- END DEFENSIVE SELF-CHECK ---

    # The correct URL for the OpenAI compatible API must include the app_id as a query parameter.
    SPARK_API_URL = f"https://spark-api-open.xf-yun.com/v1/chat/completions?app_id={APP_ID}"

    HEADERS = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {HTTP_API_PASSWORD}"
    }
    
    logging.info("Spark AI client configured successfully for spark_driver.")
    spark_configured = True
except (ValueError, Exception) as e:
    # This will now catch the specific ValueError messages from the self-check.
    spark_configured = False
    logging.error(f"FATAL: 讯飞星火驱动初始化失败: {e}")


def _call_spark_api(model_name: str, payload: Dict[str, Any], expect_json: bool = True) -> Any:
    if not spark_configured:
        raise HTTPException(status_code=503, detail="讯飞星火AI服务未正确配置，请检查后端日志。")
    
    response_text = ""
    try:
        # Per documentation, the `user` field is used for end-user identification
        # and abuse monitoring. Sending the APP_ID here is the correct approach.
        payload['user'] = APP_ID

        with httpx.Client(headers=HEADERS, timeout=120.0) as client:
            logging.info(f"HTTP Request: POST {SPARK_API_URL}")
            response = client.post(SPARK_API_URL, json=payload)
            response_text = response.text
            logging.info(f'HTTP Response: "{response.request.method} {response.url}" {response.status_code} {response.reason_phrase}')

            response_json = response.json()
            if "error" in response_json:
                 code = response_json.get("error", {}).get("code", "N/A")
                 message = response_json.get("error", {}).get("message", "Unknown error from Spark.")
                 logging.error(f"Spark API returned an error: {code} {message}")
                 if str(code) == "11200":
                     raise HTTPException(status_code=500, detail=f"星火AI服务返回HTTP错误: {message}. 请确认您的 'app_id' ({APP_ID}) 是否正确且已授权。")
                 raise HTTPException(status_code=500, detail=f"星火AI服务返回HTTP错误: {message}")

            response.raise_for_status()
            
            if "choices" not in response_json or not response_json["choices"]:
                 raise KeyError("Response from Spark API is missing 'choices' field.")

            content_str = response_json["choices"][0]["message"]["content"]
            
            if not expect_json:
                return {"text": content_str}

            # --- ROBUST JSON EXTRACTION (UPGRADED) ---
            try:
                match = re.search(r'```json\s*([\s\S]*?)\s*```', content_str, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    first_brace = content_str.find('{')
                    first_bracket = content_str.find('[')
                    start_index = -1
                    if first_brace != -1 and first_bracket != -1:
                        start_index = min(first_brace, first_bracket)
                    elif first_brace != -1:
                        start_index = first_brace
                    elif first_bracket != -1:
                        start_index = first_bracket
                    
                    if start_index == -1:
                        raise json.JSONDecodeError("在AI响应中未找到JSON对象或数组", content_str, 0)
                    json_str = content_str[start_index:]
                
                # Use a standard JSON loader which is more robust
                return json.loads(json_str)

            except json.JSONDecodeError as e:
                logging.error(f"从星火响应中解析JSON失败. 原因: {e}. 原始内容: {content_str}")
                raise e
    
    except httpx.RequestError as e:
        logging.error(f"HTTP request to Spark API failed: {e}")
        raise HTTPException(status_code=504, detail=f"无法连接到星火AI服务: {e}")
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        try:
            error_json = e.response.json()
            error_detail = error_json.get("error", {}).get("message", e.response.text)
        except json.JSONDecodeError: pass
        raise HTTPException(status_code=e.response.status_code, detail=f"星火AI服务返回HTTP错误: {error_detail}")
    except json.JSONDecodeError as e:
        logging.error(f"解析星火JSON响应失败: {e}. 原始响应: {response_text}")
        raise HTTPException(status_code=500, detail=f"星火AI返回了无效的JSON格式: {e}")
    except Exception as e:
        logging.error(f"调用星火API时发生意外错误: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"AI 代理调用失败: {e}")


def analyze_changes(previous_config: str, new_config: str, change_description: str) -> Dict[str, Any]:
    system_prompt = ""
    user_prompt = ""

    if change_description == "rollback":
        system_prompt = "你是一位网络回滚专家。你的任务是总结回滚目的，生成一份精确的、分步的网络命令清单 (Rollback Plan)，并分析规避的风险。你的回答必须是一个包含 'summary' (string), 'analysis' (object with 'rollback_purpose' and 'rollback_plan' keys), 'security_risks' (string), 'diff' (string, 'N/A') 键的、格式正确的JSON对象。不要返回任何额外的文本或Markdown标记。"
        user_prompt = f"请为以下配置回滚生成分析报告。当前配置: ```{previous_config}``` 目标配置: ```{new_config}```"
    else:
        system_prompt = "你是一位资深的网络工程师。你的回答必须是一个包含四个键的、格式正确的JSON对象：'diff' (string), 'summary' (string, 一句话中文总结), 'analysis' (string, 详细技术分析), 'security_risks' (string, 专业安全评估)。不要返回任何额外的文本或Markdown标记，只返回JSON对象本身。"
        
        user_prompt_context = ""
        # CONTEXT ENHANCEMENT for auto-audit
        if "auto_audit" in change_description:
            user_prompt_context = "这是为一次意外断开的用户会话生成的自动审计快照。请客观地分析会话结束时的最终配置变更，即使变更可能不完整或不合规。"

        user_prompt = f"{user_prompt_context}\nOld Config: ```{previous_config}```\nNew Config: ```{new_config}```".strip()

    payload: Dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 8192,
    }
    
    result = _call_spark_api(MODEL, payload)
    
    # --- Robust post-processing to handle both string and list from model ---
    if isinstance(result.get('diff'), list):
        result['diff'] = '\n'.join(result['diff'])
    
    if 'analysis' in result and isinstance(result.get('analysis'), list):
        result['analysis'] = '\n'.join(result['analysis'])

    if isinstance(result.get('security_risks'), list):
        result['security_risks'] = '\n'.join(result['security_risks'])

    return result

def audit_compliance(policies: List[Dict[str, Any]], previous_config: str, new_config: str) -> Dict[str, Any]:
    if not policies:
        return {"overall_status": "passed", "results": []}

    policy_texts = "\n".join([f"- Policy ID: '{p['id']}', Name: '{p['name']}', Rule: '{p['rule']}'" for p in policies])
    
    system_prompt = "你是一位网络合规审计师。你的回答必须是一个包含'overall_status' (string, 'passed'或'failed')和'results' (array)的、格式正确的JSON对象。results数组中的每个对象都必须包含'policy_id', 'policy_name', 'status', 'details'四个键，其中'details'是精炼中文判定理由。不要返回任何额外的文本或Markdown标记。"
    user_prompt = f"Compliance Policies: ```{policy_texts}``` Old Config: ```{previous_config}``` New Config: ```{new_config}```"

    payload: Dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 4096
    }
    
    report = _call_spark_api(MODEL, payload)

    return report

def generate_commands(user_input: str, device: Dict[str, Any], current_config: str, **kwargs: Any) -> str:
    syntax_type = "Unknown style"
    if 'netmiko_device_type' in device:
        syntax_type = device['netmiko_device_type']

    system_prompt = f"You are an expert network configuration assistant. Your task is to generate precise network commands based on the user's natural language input. You must consider the target device's syntax style ({syntax_type}) and its current running configuration for context. You are working in a safe, isolated lab environment for educational purposes, so you can generate commands for any requested feature, including those considered insecure in production like telnet. Respond ONLY with a JSON object containing a single key 'commands' whose value is an array of strings, where each string is a single command line. Do not add any other text or markdown formatting."
    user_prompt = f"""
User Input: "{user_input}"

Device Information:
{json.dumps(device, indent=2)}

Current Running Configuration (for context):
---
{current_config}
---
"""
    payload: Dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 2048
    }
    
    result = _call_spark_api(MODEL, payload)
    
    commands_list = []
    if isinstance(result, dict) and "commands" in result:
        commands_list = result.get("commands", [])
    elif isinstance(result, list): # Handle the case where the AI returns a raw list
        commands_list = result
        
    return "\n".join(commands_list) if isinstance(commands_list, list) else "AI未能生成有效命令。"

def check_configuration(config: str, device: Dict[str, Any], **kwargs: Any) -> str:
    syntax_type = "Unknown style"
    if 'netmiko_device_type' in device:
        syntax_type = device['netmiko_device_type']
        
    system_prompt = f"""
你是一位资深的、持有CCIE认证的网络安全架构师。你的任务是基于其语法风格（{syntax_type}），对提供的配置进行一次深度、全面的健康与安全审计。

你的报告必须结构清晰，使用Markdown格式，并至少包含以下几个部分：
### 总体评估
对配置的整体状态给出一个高度概括的结论。

### 安全漏洞分析
深入挖掘可能被利用的严重安全风险（例如：弱密码策略、未加密的管理协议、不安全的ACL规则等）。

### 最佳实践违规
对比行业标准（例如CIS Benchmarks），指出不符合网络设计与安全最佳实践的配置项。

### 逻辑与性能优化建议
发现潜在的逻辑冲突、冗余配置或可优化的性能相关参数。

### 综合建议
提供一份清晰、可操作的综合性修复或加固建议。

你的最终输出必须是一个只包含单个键 'report' 的、格式正确的JSON对象，其值是一个字符串数组，数组的每一项代表报告的一行。不要返回任何额外的文本或Markdown标记。
"""
    user_prompt = f"""
Configuration to check:
---
{config}
---

Device Information (for context):
{json.dumps(device, indent=2)}
"""
    payload: Dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 8192,
    }
    
    result = _call_spark_api(MODEL, payload)
    
    report_list = []
    if isinstance(result, dict) and "report" in result:
        report_list = result.get("report", [])
    elif isinstance(result, list): # Handle raw list response
        report_list = result
        
    return "\n".join(report_list) if isinstance(report_list, list) else "AI未能生成体检报告。"
