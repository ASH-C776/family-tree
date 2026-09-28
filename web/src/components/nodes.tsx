import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Person } from '../types';
import { lifeSpan } from '../utils';

export type FlowNode = Node<Record<string, unknown>, 'person-tb' | 'person-lr' | 'union-tb' | 'union-lr'>;

export interface PersonNodeData {
  person: Person;
  selected: boolean;
  dimmed: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  onToggle: (id: string) => void;
}

function readData(data: unknown): PersonNodeData {
  return data as PersonNodeData;
}

function initials(name: string): string {
  return name.trim().slice(-2);
}

function avatarColor(person: Person): string {
  if (person.gender === 'male') return 'var(--male)';
  if (person.gender === 'female') return 'var(--female)';
  return 'var(--text-muted)';
}

function Card({ data, onToggle }: { data: PersonNodeData; onToggle: (id: string) => void }) {
  const { person } = data;
  return (
    <div
      className={`person-node${data.selected ? ' selected' : ''}${data.dimmed ? ' dimmed' : ''}`}
      title={person.name}
    >
      {person.avatar ? (
        <img className="avatar" src={person.avatar} alt={person.name} />
      ) : (
        <div className="avatar" style={{ background: avatarColor(person) }}>
          {initials(person.name)}
        </div>
      )}
      <div className="meta">
        <div className="name">
          <span className={`dot ${person.gender}`} />
          {person.name}
        </div>
        <div className="dates">{lifeSpan(person) || '生卒不详'}</div>
      </div>
      {data.hasChildren && (
        <button
          className="collapse-badge"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(person.id);
          }}
          title={data.collapsed ? '展开这一支' : '收起这一支'}
        >
          {data.collapsed ? '+' : '−'}
        </button>
      )}
    </div>
  );
}

export function PersonNodeTB({ data }: NodeProps<FlowNode>) {
  const d = readData(data);
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Card data={d} onToggle={d.onToggle} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

export function PersonNodeLR({ data }: NodeProps<FlowNode>) {
  const d = readData(data);
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Card data={d} onToggle={d.onToggle} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

export function UnionNodeTB() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="union-node" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

export function UnionNodeLR() {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="union-node" />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

export const nodeTypes = {
  'person-tb': PersonNodeTB,
  'person-lr': PersonNodeLR,
  'union-tb': UnionNodeTB,
  'union-lr': UnionNodeLR,
};
