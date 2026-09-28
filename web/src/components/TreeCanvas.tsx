import { useEffect, useMemo } from 'react';
import { ReactFlow, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { computeLayout, type LayoutResult } from '../layout';
import { nodeTypes, type FlowNode } from './nodes';
import type { Direction, TreeData } from '../types';

interface Props {
  data: TreeData;
  direction: Direction;
  collapsed: Set<string>;
  selectedId: string | null;
  focusId: string | null;
  dimIds: Set<string> | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onLayout: (result: LayoutResult) => void;
}

export function TreeCanvas({
  data,
  direction,
  collapsed,
  selectedId,
  focusId,
  dimIds,
  onSelect,
  onToggleCollapse,
  onLayout,
}: Props) {
  const flow = useReactFlow();

  const layout = useMemo(() => computeLayout(data, direction, collapsed), [data, direction, collapsed]);

  useEffect(() => {
    onLayout(layout);
  }, [layout, onLayout]);

  const personsById = useMemo(() => new Map(data.persons.map((p) => [p.id, p])), [data.persons]);

  const nodes: FlowNode[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        if (n.kind === 'union') {
          return {
            id: n.id,
            type: direction === 'TB' ? 'union-tb' : 'union-lr',
            position: { x: n.x, y: n.y },
            draggable: false,
            data: {},
          } as FlowNode;
        }
        const person = personsById.get(n.personId!);
        const hasChildren = childCount(data, n.personId!) > 0;
        return {
          id: n.id,
          type: direction === 'TB' ? 'person-tb' : 'person-lr',
          position: { x: n.x, y: n.y },
          draggable: false,
          data: {
            person,
            selected: selectedId === n.personId,
            dimmed: !!dimIds && !dimIds.has(n.personId!),
            collapsed: collapsed.has(n.personId!),
            hasChildren: hasChildren || childCount(data, n.personId!) > 0,
            onToggle: onToggleCollapse,
          },
        } as FlowNode;
      }),
    [layout, direction, personsById, selectedId, dimIds, collapsed, onToggleCollapse, data],
  );

  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: {
          stroke: e.kind === 'spouse' ? 'var(--primary)' : 'var(--border)',
          strokeWidth: e.kind === 'spouse' ? 2 : 1.5,
        },
      })),
    [layout],
  );

  useEffect(() => {
    const timer = setTimeout(() => flow.fitView({ padding: 0.15, duration: 300, maxZoom: 1.05 }), 30);
    return () => clearTimeout(timer);
  }, [layout, flow]);

  useEffect(() => {
    if (!focusId) return;
    const node = layout.nodes.find((n) => n.personId === focusId);
    if (!node) return;
    flow.setCenter(node.x + node.width / 2, node.y + node.height / 2, { zoom: 1.1, duration: 400 });
  }, [focusId, layout, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      minZoom={0.15}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        if (!node.id.startsWith('u:')) onSelect(node.id);
      }}
    />
  );
}

function childCount(data: TreeData, personId: string): number {
  const unionIds = new Set(
    data.members.filter((m) => m.personId === personId && m.role === 'spouse').map((m) => m.unionId),
  );
  return data.members.filter((m) => m.role === 'child' && unionIds.has(m.unionId)).length;
}
