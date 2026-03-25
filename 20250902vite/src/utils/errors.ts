/**
 * 所有自定义应用程序错误的基类。
 * 它包含一个错误代码，用于精确识别。
 */
export class AppError extends Error {
    public readonly code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        // @fix: Ensure 'instanceof' works correctly for subclasses of Error.
        // This restores the prototype chain, which can be broken in some JS environments.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * 用于与Gemini AI服务相关问题的特定错误类。
 */
export class GeminiError extends AppError {
    constructor(message: string, code: string) {
        super(message, code);
        this.name = 'GeminiError';
    }
}
