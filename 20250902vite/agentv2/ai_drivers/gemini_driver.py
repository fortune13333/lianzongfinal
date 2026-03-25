# ai_drivers/gemini_driver.py - AI Driver for Google Gemini
import logging
import json
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from fastapi import HTTPException
from typing import Dict, List, Any

from core import config

# --- Gemini AI Configuration ---
genai_configured = False
model = None
try:
    gemini_api_key = config.get('ai_provider', 'gemini_api_key')
    if not gemini_api_key or "your" in gemini_api_key:
        raise ValueError("Gemini API key is missing or is a placeholder in config.ini")
    
    # New, recommended way to configure
    genai.configure(api_key=gemini_api_key)
    # FIX: Updated model name from deprecated 'gemini-1.5-flash-latest' to 'gemini-2.5-flash'.
    model = genai.GenerativeModel(model_name="gemini-2.5-flash")
    
    logging.info("Gemini AI client configured successfully for gemini_driver.")
    genai_configured = True
except (ValueError, Exception) as e:
    logging.error(f"Failed to configure Gemini client in gemini_driver: {e}")

def _call_gemini_with_error_handling(prompt: str, expect_json: bool = True) -> str:
    """
    Calls the Gemini API with a given prompt, including error handling and retry logic.
    """
    if not genai_configured or not model:
        raise HTTPException(status_code=503, detail="Gemini AI service is not configured or failed to initialize.")
    
    generation_config: Dict[str, Any] = {
        "temperature": 0.2,
        "top_p": 0.95,
        "top_k": 40,
        "max_output_tokens": 8192,
    }
    if expect_json:
        generation_config["response_mime_type"] = "application/json"
        
    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }

    try:
        response = model.generate_content(
            prompt,
            generation_config=generation_config, # type: ignore
            safety_settings=safety_settings
        )
        # Using response.text is the recommended, safe way to get the output.
        if not response.text:
            # Check for finish_reason other than STOP to get more details
            feedback = response.prompt_feedback
            reason = "Unknown"
            if feedback and feedback.block_reason:
                reason = feedback.block_reason.name
            
            logging.warning(f"Gemini response was blocked or empty. Reason: {reason}")
            raise HTTPException(status_code=500, detail=f"AI response was blocked or empty. Reason: {reason}")
        return response.text
    except Exception as e:
        logging.error(f"Gemini API call failed: {e}")
        error_str = str(e).lower()
        if "api key not valid" in error_str:
            raise HTTPException(status_code=401, detail="无效的 Gemini API 密钥。")
        if "user location is not supported" in error_str:
            raise HTTPException(status_code=403, detail="Gemini AI 服务在您所在的地区不可用。请尝试使用网络代理。")
        if "timed out" in error_str or "deadline exceeded" in error_str:
            raise HTTPException(status_code=504, detail="无法连接到 Google AI 服务（请求超时）。请检查服务器的网络连接、防火墙和代理设置。")
        
        # This handles the 404 model not found error and provides a more specific message
        if hasattr(e, 'message') and 'is not found for API version v1beta' in e.message:
             raise HTTPException(status_code=404, detail=f"AI模型未找到或不受支持: {e.message}")
        
        # Re-raise the original HTTPException if it's already one of ours
        if isinstance(e, HTTPException):
            raise e

        raise HTTPException(status_code=500, detail=f"AI调用时发生未知错误: {e}")

def analyze_changes(previous_config: str, new_config: str, change_description: str) -> Dict[str, Any]:
    # ... (Implementation is the same as before) ...
    if change_description == "rollback":
        prompt = f"""
        你是一位网络回滚专家。
        当前配置（Current Config）:
        ```
        {previous_config}
        ```
        目标配置（Target Config）:
        ```
        {new_config}
        ```
        任务:
        1. 总结回滚的目的。
        2. 生成一份精确的、分步的网络命令清单 (Rollback Plan)，用于从“当前配置”手动恢复到“目标配置”。
        3. 分析这次回滚解决了或规避了哪些具体的技术或安全风险。

        以以下JSON格式返回结果，不要添加任何其他解释:
        {{
            "summary": "...",
            "analysis": {{
                "rollback_purpose": "...",
                "rollback_plan": ["...", "..."]
            }},
            "security_risks": ["...", "..."],
            "diff": "N/A"
        }}
        """
    else:
        prompt = f"""
        你是一位资深的网络工程师，负责代码审查。请分析'Old Config'和'New Config'之间的配置变更。
        'New Config'是最新版本。你的分析必须使用简体中文。
        
        Old Config:
        ```
        {previous_config}
        ```
        
        New Config:
        ```
        {new_config}
        ```

        你的任务是返回一个JSON对象，必须包含四个键："diff", "summary", "analysis", "security_risks"。
        - "diff": 生成一份清晰的、逐行的差异对比。使用'+'表示新增，'-'表示删除。
        - "summary": 用一句精炼的中文总结本次变更的核心目的。
        - "analysis": 提供一份详细的技术分析，解释具体变更内容、技术目的和潜在影响。
        - "security_risks": 提供一份专业的安全评估，指出潜在的安全漏洞、最佳实践违规或改进点。如果没有，请明确说明。
        
        返回纯粹的、原始的JSON对象，不要包含任何额外的文本或Markdown标记。
        """

    response_text = _call_gemini_with_error_handling(prompt, expect_json=True)
    
    try:
        result = json.loads(response_text)
        if 'diff' in result and isinstance(result['diff'], list):
            result['diff'] = '\n'.join(result['diff'])
        return result
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse Gemini JSON response for analysis: {e}. Response was: {response_text}")
        raise HTTPException(status_code=500, detail="AI返回了无效的JSON格式。")

def audit_compliance(policies: List[Dict[str, Any]], previous_config: str, new_config: str) -> Dict[str, Any]:
    if not policies:
        return {"overall_status": "passed", "results": []}

    policy_texts = "\n".join([f"- Policy ID: '{p['id']}', Name: '{p['name']}', Rule: '{p['rule']}'" for p in policies])
    
    prompt = f"""
    你是一位网络合规审计师。你的任务是判断'New Config'相对于'Old Config'的变更，是否违反了下面列出的任何一条'Compliance Policies'。

    Compliance Policies:
    {policy_texts}

    Old Config:
    ```
    {previous_config}
    ```

    New Config:
    ```
    {new_config}
    ```

    指令:
    1. 分析从旧配置到新配置的变更。
    2. 对于【每一条】策略，判断新配置是否合规。
    3. 为每条策略提供一个简短的'details'字符串（简体中文），解释你的判定理由。
    4. 如果【任何一条】策略被违反，将'overall_status'设为'failed'，否则设为'passed'。

    以如下JSON格式返回结果，不要添加任何其他文本或Markdown标记：
    {{
        "overall_status": "passed_or_failed",
        "results": [
            {{
                "policy_id": "{policies[0]['id']}",
                "policy_name": "{policies[0]['name']}",
                "status": "passed_or_failed",
                "details": "你的精炼中文判定理由。"
            }}
        ]
    }}
    """
    response_text = _call_gemini_with_error_handling(prompt, expect_json=True)
    try:
        report = json.loads(response_text)
        # The decision to block is now moved to the service layer.
        # This driver's responsibility is only to return the audit result.
        return report
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse Gemini JSON response for audit: {e}. Response was: {response_text}")
        raise HTTPException(status_code=500, detail="AI合规性审计返回了无效的JSON格式。")

# --- New Functions for Frontend AI Tools ---
def generate_commands(user_input: str, device: Dict[str, Any], current_config: str, **kwargs: Any) -> str:
    # kwargs is added to accept syntax_type without using it, for interface consistency
    prompt = f"""
You are an expert network configuration assistant. You are working in a safe, isolated lab environment for educational purposes.
Your task is to generate precise network commands based on the user's natural language input.
You must infer the correct syntax style from the device information and current configuration.
Use the provided current running configuration for context to generate more accurate and relevant commands.

User Input: "{user_input}"

Device Information:
{json.dumps(device, indent=2)}

Current Running Configuration (for context):
---
{current_config}
---

Generate ONLY the configuration commands as a raw text string. Do not add any explanation, markdown formatting, or JSON.
"""
    response_text = _call_gemini_with_error_handling(prompt, expect_json=False)
    return response_text.strip()


def check_configuration(config: str, device: Dict[str, Any], **kwargs: Any) -> str:
    # kwargs is added to accept syntax_type without using it, for interface consistency
    prompt = f"""
You are a network security auditor. Your task is to perform a comprehensive health and security scan on the provided configuration.
You must infer the correct syntax style from the configuration itself and the device information.
Provide a detailed report in simplified Chinese, pointing out security vulnerabilities, best practice violations, and logical errors, along with optimization suggestions.

Configuration to check:
---
{config}
---

Device Information (for context):
{json.dumps(device, indent=2)}

Generate the report as a raw text string. Do not add any other text, markdown formatting, or JSON.
"""
    response_text = _call_gemini_with_error_handling(prompt, expect_json=False)
    return response_text.strip()