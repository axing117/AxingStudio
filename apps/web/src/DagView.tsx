import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from './api';
import type { WorkflowGraph, WorkflowGraphNode } from './api';

/* ------------------------------------------------------------------ */
/*  Layout: simple layered (Sugiyama-style) top-to-bottom              */
/* ------------------------------------------------------------------ */

interface LayoutNode extends WorkflowGraphNode {
  x: number;
  y: number;
  layer: number;
}

interface LayoutEdge {
  from: string;
  to: string;
  points: { x: number; y: number }[];
}

const NODE_W = 180;
const NODE_H = 64;
const LAYER_GAP = 100;
const NODE_GAP = 30;

const TYPE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  oracle: { bg: '#2d1b4e', border: '#a78bfa', label: '策略室' },
  forge: { bg: '#3b1f0a', border: '#f59e0b', label: '工程室' },
  hermes: { bg: '#0a2e2e', border: '#2dd4bf', label: '媒体室' },
  sentinel: { bg: '#2e2a0a', border: '#eab308', label: '质量室' },
};

const STATUS_COLORS: Record<string, string> = {
  queued: '#6b7280',
  blocked: '#9ca3af',
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  retrying: '#f59e0b',
};

function computeLayout(graph: WorkflowGraph): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const { nodes, edges } = graph;

  // Topological sort to assign layers
  const inDeg = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const e of edges) {
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    children.get(e.from)?.push(e.to);
  }

  // BFS layering
  const layers: string[][] = [];
  const layerOf = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if ((inDeg.get(n.id) || 0) === 0) {
      queue.push(n.id);
      layerOf.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const layer = layerOf.get(id)!;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(id);

    for (const childId of children.get(id) || []) {
      const newLayer = layer + 1;
      const prev = layerOf.get(childId);
      if (prev === undefined || newLayer > prev) {
        layerOf.set(childId, newLayer);
      }
      const deg = (inDeg.get(childId) || 1) - 1;
      inDeg.set(childId, deg);
      if (deg === 0) queue.push(childId);
    }
  }

  // Handle nodes not reached (isolated)
  for (const n of nodes) {
    if (!layerOf.has(n.id)) {
      layerOf.set(n.id, 0);
      if (!layers[0]) layers[0] = [];
      layers[0].push(n.id);
    }
  }

  // Assign positions
  const layoutNodes: LayoutNode[] = [];
  for (let l = 0; l < layers.length; l++) {
    const ids = layers[l];
    const totalWidth = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = -totalWidth / 2;
    for (let i = 0; i < ids.length; i++) {
      const node = nodes.find(n => n.id === ids[i])!;
      layoutNodes.push({
        ...node,
        x: startX + i * (NODE_W + NODE_GAP),
        y: l * (NODE_H + LAYER_GAP),
        layer: l,
      });
    }
  }

  // Compute edge paths
  const posMap = new Map(layoutNodes.map(n => [n.id, n]));
  const layoutEdges: LayoutEdge[] = edges.map(e => {
    const from = posMap.get(e.from);
    const to = posMap.get(e.to);
    if (!from || !to) return { ...e, points: [] };
    const startX = from.x + NODE_W / 2;
    const startY = from.y + NODE_H;
    const endX = to.x + NODE_W / 2;
    const endY = to.y;
    const midY = (startY + endY) / 2;
    return {
      ...e,
      points: [
        { x: startX, y: startY },
        { x: startX, y: midY },
        { x: endX, y: midY },
        { x: endX, y: endY },
      ],
    };
  });

  return { nodes: layoutNodes, edges: layoutEdges };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface DagViewProps {
  rootTaskId: string;
  onClose: () => void;
}

export function DagView({ rootTaskId, onClose }: DagViewProps) {
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.workflowGraph(rootTaskId).then(setGraph).catch(e => setError(String(e)));
  }, [rootTaskId]);

  const layout = useMemo(() => graph ? computeLayout(graph) : null, [graph]);

  const handleNodeClick = useCallback((id: string) => {
    setSelected(prev => prev === id ? null : id);
  }, []);

  if (error) return (
    <div style={{ padding: 24, color: '#ef4444' }}>
      <p>加载工作流图失败: {error}</p>
      <button onClick={onClose} style={closeBtnStyle}>关闭</button>
    </div>
  );

  if (!layout) return <div style={{ padding: 24, color: '#9ca3af' }}>加载中...</div>;

  const { nodes, edges } = layout;

  // Calculate SVG viewBox
  const minX = Math.min(...nodes.map(n => n.x)) - 40;
  const maxX = Math.max(...nodes.map(n => n.x + NODE_W)) + 40;
  const minY = -20;
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H)) + 40;
  const svgW = maxX - minX;
  const svgH = maxY - minY;

  const selectedNode = nodes.find(n => n.id === selected);

  return (
    <div style={{ position: 'relative', background: '#0f172a', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 14 }}>工作流 DAG — {graph?.nodes.length ?? 0} 个节点</h3>
        <button onClick={onClose} style={closeBtnStyle}>✕ 关闭</button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 16px', fontSize: 12, color: '#94a3b8' }}>
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: val.border }} />
            {val.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {Object.entries(STATUS_COLORS).map(([s, c]) => (
            <span key={s} style={{ marginLeft: 10 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 3 }} />
              {s}
            </span>
          ))}
        </span>
      </div>

      {/* SVG Canvas */}
      <svg
        width="100%"
        viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
        style={{ display: 'block', maxHeight: 500, background: '#0f172a' }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => (
          <polyline
            key={i}
            points={e.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#334155"
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        ))}

        {/* Nodes */}
        {nodes.map(n => {
          const colors = TYPE_COLORS[n.type] || TYPE_COLORS.oracle;
          const statusColor = STATUS_COLORS[n.status] || '#6b7280';
          const isSelected = n.id === selected;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => handleNodeClick(n.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={colors.bg}
                stroke={isSelected ? '#ffffff' : colors.border}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Status dot */}
              <circle cx={NODE_W - 12} cy={12} r={5} fill={statusColor}>
                {n.status === 'running' && (
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                )}
              </circle>
              {/* Type label */}
              <text x={10} y={18} fontSize={10} fill={colors.border} fontFamily="monospace">
                {colors.label}
              </text>
              {/* Title */}
              <text x={10} y={38} fontSize={12} fill="#e2e8f0" fontFamily="system-ui" fontWeight="600">
                {n.label.length > 18 ? n.label.slice(0, 18) + '…' : n.label}
              </text>
              {/* Status text */}
              <text x={10} y={54} fontSize={10} fill="#94a3b8" fontFamily="monospace">
                {n.status}{n.retryCount > 0 ? ` (重试${n.retryCount})` : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      {selectedNode && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b', fontSize: 12, color: '#94a3b8' }}>
          <strong style={{ color: '#e2e8f0' }}>{selectedNode.label}</strong>
          <span style={{ marginLeft: 12 }}>类型: {selectedNode.type}</span>
          <span style={{ marginLeft: 12 }}>状态: {selectedNode.status}</span>
          <span style={{ marginLeft: 12 }}>ID: {selectedNode.id.slice(0, 8)}…</span>
          {selectedNode.retryCount > 0 && <span style={{ marginLeft: 12 }}>重试: {selectedNode.retryCount}次</span>}
        </div>
      )}
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: 12,
};
