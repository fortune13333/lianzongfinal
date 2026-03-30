/**
 * apiUtils.test.ts — 测试 API URL 构建工具
 */
import { describe, it, expect } from 'vitest';
import { createApiUrl } from '../utils/apiUtils';

describe('createApiUrl', () => {
  it('joins base URL and path with no double slashes', () => {
    expect(createApiUrl('http://localhost:8001', '/api/data')).toBe('http://localhost:8001/api/data');
  });

  it('handles base URL with trailing slash', () => {
    expect(createApiUrl('http://localhost:8001/', '/api/data')).toBe('http://localhost:8001/api/data');
  });

  it('handles path without leading slash', () => {
    expect(createApiUrl('http://localhost:8001', 'api/data')).toBe('http://localhost:8001/api/data');
  });

  it('handles both trailing and leading slashes', () => {
    expect(createApiUrl('http://192.168.1.1:8001/', '/api/devices')).toBe('http://192.168.1.1:8001/api/devices');
  });
});
