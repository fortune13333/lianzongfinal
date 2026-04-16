/**
 * apiFetch.ts - 统一带 JWT 认证头的 fetch 工具
 *
 * 从 sessionStorage 自动读取 JWT 令牌，附加 Authorization 头。
 * 所有需要认证的 API 调用应使用此函数代替原生 fetch。
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = sessionStorage.getItem('chaintrace_token');
    const existingHeaders = (options.headers || {}) as Record<string, string>;
    const headers: Record<string, string> = { ...existingHeaders };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        sessionStorage.removeItem('chaintrace_token');
        sessionStorage.removeItem('chaintrace_user');
        // Dispatch event instead of hard-redirecting — lets Zustand logout() handle UI transition
        // gracefully, and prevents background polling from force-navigating during active use.
        window.dispatchEvent(new CustomEvent('chaintrace:unauthorized'));
    }
    return response;
};
