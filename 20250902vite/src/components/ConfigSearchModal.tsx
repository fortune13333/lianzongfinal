import React, { useState } from 'react';
import { Device, ConfigSearchResult } from '../types';
import { useStore } from '../store/useStore';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';

interface Props {
  devices: Device[];
  onClose: () => void;
}

const ConfigSearchModal: React.FC<Props> = ({ devices, onClose }) => {
  const { settings } = useStore();
  const [query, setQuery] = useState('');
  const [filterDeviceId, setFilterDeviceId] = useState('');
  const [results, setResults] = useState<ConfigSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setResults([]);
    setSearched(false);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (filterDeviceId) params.set('device_id', filterDeviceId);
      const url = createApiUrl(settings.agentApiUrl, `/api/search?${params.toString()}`);
      const res = await apiFetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('搜索失败。');
      const data: ConfigSearchResult[] = await res.json();
      setResults(data);
      setSearched(true);
    } catch {
      setSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  const getDeviceName = (id: string) => devices.find(d => d.id === id)?.name ?? id;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-100">配置历史搜索</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSearch} className="p-4 border-b border-bg-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索关键词，例如：ospf、interface GigabitEthernet..."
              className="flex-1 bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            <select
              value={filterDeviceId}
              onChange={e => setFilterDeviceId(e.target.value)}
              className="bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 min-w-32"
            >
              <option value="">所有设备</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap"
            >
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>
        </form>

        <div className="max-h-[50vh] overflow-y-auto">
          {!searched && !isSearching && (
            <p className="p-8 text-center text-text-500 text-sm">输入关键词搜索所有历史配置区块</p>
          )}
          {searched && results.length === 0 && (
            <p className="p-8 text-center text-text-500 text-sm">未找到包含 "{query}" 的配置记录。</p>
          )}
          {results.map((r, i) => (
            <div key={i} className="p-4 border-b border-bg-800 hover:bg-bg-850">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-primary-400">{getDeviceName(r.device_id)}</span>
                  <span className="text-xs bg-bg-700 text-text-400 px-2 py-0.5 rounded-full">版本 {r.version}</span>
                  <span className="text-xs bg-bg-700 text-text-400 px-2 py-0.5 rounded-full">区块 #{r.block_index}</span>
                </div>
                <span className="text-xs text-text-500">{new Date(r.timestamp).toLocaleString('zh-CN')}</span>
              </div>
              <div className="space-y-1">
                {r.matched_lines.map((line, j) => (
                  <pre key={j} className="text-xs font-mono bg-bg-950 rounded px-2 py-1 text-text-300 overflow-x-auto">
                    {line}
                  </pre>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-bg-700 flex justify-between items-center">
          {searched && <span className="text-xs text-text-400">找到 {results.length} 条匹配记录</span>}
          <button onClick={onClose} className="ml-auto bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigSearchModal;
