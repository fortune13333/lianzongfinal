import { Device } from '../types';
import { AppError } from "../utils/errors";
import { useStore } from "../store/useStore";
import { createApiUrl } from "../utils/apiUtils";
import { apiFetch } from "../utils/apiFetch";

export const checkKeyAvailability = () => {
    const driver = process.env.VITE_AI_DRIVER || 'gemini';
    if (driver !== 'custom') {
        throw new AppError(
            "AI驱动配置错误。前端AI功能现在必须通过后端代理。请在 .env 文件中设置 VITE_AI_DRIVER=custom。",
            "ERR_INVALID_AI_DRIVER"
        );
    }
};

// FIX: Added currentConfig parameter to provide more context to the AI for better command generation.
const generateConfigFromPrompt = async (
  userInput: string,
  device: Device,
  currentConfig: string,
): Promise<string> => {
    const driver = process.env.VITE_AI_DRIVER || 'gemini';
    const settings = useStore.getState().settings;

    if (!settings.ai.commandGeneration.enabled) {
        throw new Error('AI 命令生成功能已被禁用。');
    }
    
    if (driver === 'custom') {
        let apiUrl = process.env.VITE_COMMAND_GENERATION_API_URL || settings.ai.commandGeneration.apiUrl;
        if (!apiUrl) {
            throw new Error("前端 AI 驱动设置为 'custom'，但未在 .env 或设置中提供服务接口 URL。");
        }
        
        if (apiUrl.startsWith('/')) {
            const agentApiUrl = useStore.getState().settings.agentApiUrl;
            if (!agentApiUrl) {
                throw new Error("无法使用相对AI API URL，因为未配置代理地址。");
            }
            apiUrl = createApiUrl(agentApiUrl, apiUrl);
        }

        try {
            const response = await apiFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userInput, device, currentConfig }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `代理返回错误: ${response.status}` }));
                throw new Error(errorData.detail);
            }
            const data = await response.json();
            return data.commands || '';
        } catch (error) {
            console.error("Backend proxy for command generation failed:", error);
            const msg = error instanceof Error ? error.message : "未知错误。";
            throw new Error(`AI 代理调用失败: ${msg}`);
        }
    }

    throw new AppError(
        "不再支持直接在浏览器中调用 AI。请在 .env 文件中设置 VITE_AI_DRIVER=custom 并配置后端代理。",
        "ERR_DIRECT_AI_DEPRECATED"
    );
};

const checkConfiguration = async (config: string, device: Device): Promise<string> => {
    const driver = process.env.VITE_AI_DRIVER || 'gemini';
    const settings = useStore.getState().settings;

    if (!settings.ai.configCheck.enabled) {
        throw new Error('AI 配置体检功能已被禁用。');
    }

    if (driver === 'custom') {
        let apiUrl = process.env.VITE_CONFIG_CHECK_API_URL || settings.ai.configCheck.apiUrl;
        if (!apiUrl) {
            throw new Error("前端 AI 驱动设置为 'custom'，但未在 .env 或设置中提供服务接口 URL。");
        }
        
        if (apiUrl.startsWith('/')) {
            const agentApiUrl = useStore.getState().settings.agentApiUrl;
            if (!agentApiUrl) {
                throw new Error("无法使用相对AI API URL，因为未配置代理地址。");
            }
            apiUrl = createApiUrl(agentApiUrl, apiUrl);
        }

        try {
            const response = await apiFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, device }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `代理返回错误: ${response.status}` }));
                throw new Error(errorData.detail);
            }
            const data = await response.json();
            return data.report || '代理未返回报告。';
        } catch (error) {
            console.error("Backend proxy for config check failed:", error);
            const msg = error instanceof Error ? error.message : "未知错误。";
            throw new Error(`AI 代理调用失败: ${msg}`);
        }
    }

    throw new AppError(
        "不再支持直接在浏览器中调用 AI。请在 .env 文件中设置 VITE_AI_DRIVER=custom 并配置后端代理。",
        "ERR_DIRECT_AI_DEPRECATED"
    );
};

export const geminiService = {
  checkKeyAvailability,
  generateConfigFromPrompt,
  checkConfiguration,
};
