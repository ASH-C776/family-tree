import dagre from '@dagrejs/dagre';
import type { Direction, TreeData } from './types';

export const PERSON_W = 176;
export const PERSON_H = 76;
export const UNION_SIZE = 10;

export interface LayoutNode {
  id: string;
  kind: 'person' | 'union';
  personId?: string;
  unionId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'spouse' | 'child';
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

interface Index {
  spouseUnions: Map<string, string[]>;
  parentUnions: Map<string, string[]>;
  spousesOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
}

export function indexTree(data: TreeData): Index {
  const spouseUnions = new Map<string, string[]>();
  const parentUnions = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();

  for (const m of data.members) {
    if (m.role === 'spouse') {
      spouseUnions.set(m.personId, [...(spouseUnions.get(m.personId) ?? []), m.unionId]);
      const list = spousesOf.get(m.unionId) ?? [];
      list.push(m.personId);
      spousesOf.set(m.unionId, list);
    } else {
      parentUnions.set(m.personId, [...(parentUnions.get(m.personId) ?? []), m.unionId]);
      const list = childrenOf.get(m.unionId) ?? [];
      list.push(m.personId);
      childrenOf.set(m.unionId, list);
    }
  }

  for (const [unionId, list] of childrenOf) {
    const byId = new Map(data.persons.map((p) => [p.id, p]));
    list.sort((a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      const oa = pa?.birthOrder ?? 999;
      const ob = pb?.birthOrder ?? 999;
      if (oa !== ob) return oa - ob;
      return (pa?.birthDate ?? '9999').localeCompare(pb?.birthDate ?? '9999');
    });
    childrenOf.set(unionId, list);
  }

  return { spouseUnions, parentUnions, spousesOf, childrenOf };
}

export function findRoots(data: TreeData, index: Index): string[] {
  const withParents = new Set<string>();
  for (const m of data.members) {
    if (m.role === 'child') withParents.add(m.personId);
  }
  const roots = data.persons.filter((p) => !withParents.has(p.id));
  if (roots.length) return roots.map((p) => p.id);
  return data.persons.slice(0, 1).map((p) => p.id);
}

export function visibleSets(
  data: TreeData,
  index: Index,
  roots: string[],
  collapsed: Set<string>,
): { persons: Set<string>; unions: Set<string> } {
  const visiblePersons = new Set<string>();
  const visibleUnions = new Set<string>();
  const queue = [...roots];

  while (queue.length) {
    const pid = queue.shift()!;
    if (visiblePersons.has(pid)) continue;
    visiblePersons.add(pid);
    const unions = index.spouseUnions.get(pid) ?? index.parentUnions.get(pid) ?? [];
    for (const uid of unions) {
      if (visibleUnions.has(uid)) continue;
      visibleUnions.add(uid);
      for (const spouseId of index.spousesOf.get(uid) ?? []) {
        if (!visiblePersons.has(spouseId)) queue.push(spouseId);
      }
      if (collapsed.has(pid)) continue;
      for (const childId of index.childrenOf.get(uid) ?? []) {
        if (!visiblePersons.has(childId)) queue.push(childId);
      }
    }
  }

  for (const p of data.persons) {
    if (!visiblePersons.has(p.id) && !(index.spouseUnions.get(p.id)?.length || index.parentUnions.get(p.id)?.length)) {
      visiblePersons.add(p.id);
    }
  }

  return { persons: visiblePersons, unions: visibleUnions };
}

export function computeLayout(
  data: TreeData,
  direction: Direction,
  collapsed: Set<string>,
  rootIds?: string[],
): LayoutResult {
  const index = indexTree(data);
  const roots = rootIds?.length ? rootIds : findRoots(data, index);
  const visible = visibleSets(data, index, roots, collapsed);

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'TB' ? 26 : 22,
    ranksep: direction === 'TB' ? 52 : 78,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const pid of visible.persons) {
    g.setNode(pid, { width: PERSON_W, height: PERSON_H });
  }
  for (const uid of visible.unions) {
    g.setNode(`u:${uid}`, { width: UNION_SIZE, height: UNION_SIZE });
  }

  for (const uid of visible.unions) {
    for (const spouseId of index.spousesOf.get(uid) ?? []) {
      if (visible.persons.has(spouseId)) g.setEdge(spouseId, `u:${uid}`);
    }
    for (const childId of index.childrenOf.get(uid) ?? []) {
      if (visible.persons.has(childId)) g.setEdge(`u:${uid}`, childId);
    }
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = [];
  for (const id of g.nodes()) {
    const n = g.node(id);
    if (!n) continue;
    const isUnion = id.startsWith('u:');
    nodes.push({
      id,
      kind: isUnion ? 'union' : 'person',
      personId: isUnion ? undefined : id,
      unionId: isUnion ? id.slice(2) : undefined,
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      width: n.width,
      height: n.height,
    });
  }

  const edges: LayoutEdge[] = [];
  for (const e of g.edges()) {
    const unionSide = e.v.startsWith('u:') || e.w.startsWith('u:');
    edges.push({
      id: `${e.v}->${e.w}`,
      source: e.v,
      target: e.w,
      kind: unionSide ? (e.v.startsWith('u:') ? 'child' : 'spouse') : 'child',
    });
  }

  const width = Math.max(0, ...nodes.map((n) => n.x + n.width));
  const height = Math.max(0, ...nodes.map((n) => n.y + n.height));

  return { nodes, edges, width, height };
}
