/**
 * apiFetch.test.ts — 测试 JWT 自动注入和 401 自动登出行为
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../utils/apiFetch';

// jsdom 提供 sessionStorage 和 window，但 window.location.href 的赋值需要 mock
const mockLocationHref = vi.fn();
Object.defineProperty(window, 'location', {
  value: { href: '', set href(v: string) { mockLocationHref(v); } },
  writable: true,
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  sessionStorage.clear();
  mockFetch.mockReset();
  mockLocationHref.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('apiFetch', () => {
  it('calls fetch with the given URL and no Authorization header if no token stored', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('http://localhost/api/data');
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('injects stored JWT into Authorization header', async () => {
    sessionStorage.setItem('chaintrace_token', 'test.jwt.token');
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('http://localhost/api/data');
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test.jwt.token');
  });

  it('preserves caller-provided headers alongside Authorization', async () => {
    sessionStorage.setItem('chaintrace_token', 'my.token');
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('http://localhost/api/data', {
      headers: { 'Content-Type': 'application/json' },
    });
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer my.token');
  });

  it('on 401 response, clears sessionStorage and redirects to /', async () => {
    sessionStorage.setItem('chaintrace_token', 'expired.token');
    sessionStorage.setItem('chaintrace_user', '{"username":"admin"}');
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await apiFetch('http://localhost/api/data');
    expect(sessionStorage.getItem('chaintrace_token')).toBeNull();
    expect(sessionStorage.getItem('chaintrace_user')).toBeNull();
    expect(mockLocationHref).toHaveBeenCalledWith('/');
  });

  it('on non-401 error response, does NOT clear sessionStorage', async () => {
    sessionStorage.setItem('chaintrace_token', 'valid.token');
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    await apiFetch('http://localhost/api/data');
    expect(sessionStorage.getItem('chaintrace_token')).toBe('valid.token');
    expect(mockLocationHref).not.toHaveBeenCalled();
  });
});
