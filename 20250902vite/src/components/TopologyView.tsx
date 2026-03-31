// TopologyView.tsx - Network topology visualization using React Flow.

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import type { NodeProps, EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../store/useStore';
import type { TopologyNode, TopologyEdge } from '../store/storeTypes';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';

// ── Circular layout ───────────────────────────────────────

function circularLayout(nodes: TopologyNode[]): TopologyNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 400, y: 300 } }];
  const cx = 500;
  const cy = 350;
  const radius = Math.min(350, 80 * nodes.length);
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { ...n, position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) } };
  });
}

// ── Custom Node ───────────────────────────────────────────

const TopologyNodeComponent: React.FC<NodeProps> = ({ data }) => {
  const isManaged = !!(data as Record<string, unknown>).managed;
  return (
    <div
      className={`px-3 py-2 rounded-lg border text-xs font-medium shadow-md min-w-[90px] text-center
        ${isManaged
          ? 'bg-primary-900/80 border-primary-500 text-primary-200'
          : 'bg-bg-800/80 border-bg-600 text-text-400'
        }`}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      <div className="text-base mb-0.5">{isManaged ? '🟢' : '⚪'}</div>
      <div className="truncate max-w-[120px]">{String((data as Record<string, unknown>).label ?? '')}</div>
      {!isManaged && <div className="text-[10px] text-text-500 mt-0.5">未受管</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
};

const nodeTypes = { topology: TopologyNodeComponent };

// ── Edge label formatter ──────────────────────────────────

function formatEdgeLabel(data: TopologyEdge['data']): string {
  const abbrev = (port: string | null) => {
    if (!port) return '';
    return port
      .replace(/GigabitEthernet/i, 'Gi')
      .replace(/FastEthernet/i, 'Fa')
      .replace(/TenGigabitEthernet/i, 'Te')
      .replace(/Ethernet/i, 'Et');
  };
  const src = abbrev(data.sourcePort);
  const tgt = abbrev(data.targetPort);
  if (src && tgt) return `${src} ↔ ${tgt}`;
  if (src) return src;
  if (tgt) return tgt;
  return data.protocol.toUpperCase();
}

// ── Main component ────────────────────────────────────────

const TopologyView: React.FC = () => {
  const {
    topologyNodes,
    topologyEdges,
    topologyLastDiscoveredAt,
    isTopologyLoading,
    fetchTopology,
    discoverTopology,
    clearTopology,
    currentUser,
    devices,
  } = useStore(state => ({
    topologyNodes: state.topologyNodes,
    topologyEdges: state.topologyEdges,
    topologyLastDiscoveredAt: state.topologyLastDiscoveredAt,
    isTopologyLoading: state.isTopologyLoading,
    fetchTopology: state.fetchTopology,
    discoverTopology: state.discoverTopology,
    clearTopology: state.clearTopology,
    currentUser: state.currentUser!,
    devices: state.devices,
  }));

  // Apply circular layout on first render of nodes from store
  const laidOutNodes = useMemo(() => {
    if (topologyNodes.length === 0) return [];
    return circularLayout(topologyNodes);
  }, [topologyNodes]);

  const rfEdges = useMemo(() =>
    topologyEdges.map((e: TopologyEdge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: formatEdgeLabel(e.data),
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
      labelBgStyle: { fill: '#1e293b', fillOpacity: 0.85 },
      style: { stroke: e.data.protocol === 'lldp' ? '#60a5fa' : '#34d399', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    })),
    [topologyEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(laidOutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => { setNodes(laidOutNodes); }, [laidOutNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  useEffect(() => { fetchTopology(); }, [fetchTopology]);

  const canReset = hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_RESET);

  const handleDiscover = useCallback(() => discoverTopology(undefined, false), [discoverTopology]);
  const handleSimulate = useCallback(() => discoverTopology(undefined, true), [discoverTopology]);

  const lastDiscoveredText = topologyLastDiscoveredAt
    ? new Date(topologyLastDiscoveredAt).toLocaleString('zh-CN')
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-bg-800 pb-4">
        <div>
          <h2 className="text-3xl font-bold text-text-100">网络拓扑</h2>
          {lastDiscoveredText && (
            <p className="text-xs text-text-500 mt-0.5">上次发现: {lastDiscoveredText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscover}
            disabled={isTopologyLoading || devices.length === 0}
            className="text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-md transition-colors"
          >
            {isTopologyLoading ? '发现中...' : '开始发现'}
          </button>
          <button
            onClick={handleSimulate}
            disabled={isTopologyLoading}
            className="text-sm bg-bg-800 hover:bg-bg-700 text-text-300 hover:text-primary-300 font-medium py-2 px-3 rounded-md transition-colors"
            title="使用模拟数据展示拓扑"
          >
            模拟演示
          </button>
          <button
            onClick={() => fetchTopology()}
            disabled={isTopologyLoading}
            className="text-sm bg-bg-800 hover:bg-bg-700 text-text-300 hover:text-primary-300 font-medium py-2 px-3 rounded-md transition-colors"
          >
            刷新
          </button>
          {canReset && (
            <button
              onClick={clearTopology}
              disabled={isTopologyLoading || topologyNodes.length === 0}
              className="text-sm bg-bg-800 hover:bg-red-600/50 text-text-300 hover:text-red-300 font-medium py-2 px-3 rounded-md transition-colors disabled:opacity-50"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-text-500">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block"></span> CDP</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"></span> LLDP</span>
        <span className="flex items-center gap-1">🟢 受管设备</span>
        <span className="flex items-center gap-1">⚪ 未受管设备</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 rounded-lg border border-bg-800 overflow-hidden bg-bg-950">
        {topologyNodes.length === 0 && !isTopologyLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-text-100 mb-2">暂无拓扑数据</h3>
            <p className="text-text-400 mb-4 max-w-md">
              点击「开始发现」自动对受管设备执行 CDP/LLDP 探测，或点击「模拟演示」查看示例拓扑。
            </p>
            <div className="flex gap-2">
              <button onClick={handleDiscover} className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md">
                开始发现
              </button>
              <button onClick={handleSimulate} className="text-sm bg-bg-800 hover:bg-bg-700 text-text-200 font-medium py-2 px-4 rounded-md">
                模拟演示
              </button>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            colorMode="dark"
          >
            <Background color="#334155" gap={24} size={1} />
            <Controls className="!bg-bg-900 !border-bg-700" />
            <MiniMap
              nodeColor={(n) => ((n.data as Record<string, unknown>).managed ? '#3b82f6' : '#475569')}
              className="!bg-bg-900 !border-bg-700"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};

export default TopologyView;
