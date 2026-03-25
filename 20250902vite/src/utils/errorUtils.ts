import { AppError } from './errors';

/**
 * 解析一个错误对象并返回一个用户友好的消息，
 * 通过检查其代码来对已知的AI相关错误进行特殊处理。
 * @param error 错误对象，通常来自catch块。
 * @returns 包含清晰、面向用户的错误消息及特定代码的字符串。
 */
export const getAIFailureMessage = (error: unknown): string => {
    if (error instanceof AppError) {
        // 处理带有特定代码的自定义应用程序错误
        switch(error.code) {
            case 'ERR_GEMINI_API_KEY_MISSING':
                return `AI配置检查失败：${error.message} (代码: ${error.code})`;
            case 'ERR_GEMINI_CMD_GEN_FAILED':
                return `AI命令生成失败：${error.message} (代码: ${error.code})`;
            case 'ERR_GEMINI_CONFIG_CHECK_FAILED':
                 return `AI配置体检失败：${error.message} (代码: ${error.code})`;
            default:
                return `AI操作失败：${error.message} (代码: ${error.code})`;
        }
    }

    if (error instanceof Error) {
        // 针对通用JavaScript错误的后备方案
        return error.message;
    }

    // 针对未知错误类型的最终后备方案
    return '发生未知 AI 错误。';
};