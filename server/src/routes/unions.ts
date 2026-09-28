import type { FastifyInstance } from 'fastify';
import { db, newId, now } from '../db.js';
import { requireAuth, requireRole } from '../http.js';
import type { UnionStatus } from '../types.js';

interface UnionInput {
  spouseIds?: string[];
  childIds?: string[];
  status?: UnionStatus;
  startDate?: string | null;
  endDate?: string | null;
  note?: string | null;
}

function replaceMembers(unionId: string, spouseIds: string[], childIds: string[]): void {
  db.prepare('DELETE FROM union_members WHERE union_id = ?').run(unionId);
  const insert = db.prepare(
    'INSERT OR REPLACE INTO union_members (union_id, person_id, role, order_index) VALUES (?, ?, ?, ?)',
  );
  spouseIds.forEach((personId, i) => insert.run(unionId, personId, 'spouse', i));
  childIds.forEach((personId, i) => insert.run(unionId, personId, 'child', i));
}

function assertPersonsExist(ids: string[]): boolean {
  const stmt = db.prepare('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL');
  return ids.every((id) => stmt.get(id) !== undefined);
}

export async function unionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/unions', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const body = (req.body ?? {}) as UnionInput;
    const spouseIds = body.spouseIds ?? [];
    const childIds = body.childIds ?? [];
    if (!spouseIds.length && !childIds.length) {
      return reply.code(400).send({ error: '至少需要一个配偶或子女' });
    }
    if (!assertPersonsExist([...spouseIds, ...childIds])) {
      return reply.code(400).send({ error: '包含不存在的人物' });
    }
    const id = newId('f');
    const ts = now();
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO unions (id, status, start_date, end_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, body.status ?? 'married', body.startDate ?? null, body.endDate ?? null, body.note ?? null, ts, ts);
      replaceMembers(id, spouseIds, childIds);
    });
    tx();
    reply.send({ union: { id, status: body.status ?? 'married' }, spouseIds, childIds });
  });

  app.patch('/api/unions/:id', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as UnionInput & { expectedUpdatedAt?: number };
    const row = db.prepare('SELECT * FROM unions WHERE id = ? AND deleted_at IS NULL').get(id) as
      | { id: string; updated_at: number }
      | undefined;
    if (!row) return reply.code(404).send({ error: '家庭关系不存在' });
    if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) {
      return reply.code(409).send({ error: '这条关系已被其他人修改过，请刷新后再保存' });
    }
    const spouseIds = body.spouseIds;
    const childIds = body.childIds;
    const ts = now();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE unions SET status = COALESCE(?, status), start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date), note = COALESCE(?, note), updated_at = ? WHERE id = ?`,
      ).run(body.status ?? null, body.startDate ?? null, body.endDate ?? null, body.note ?? null, ts, id);
      if (spouseIds || childIds) {
        if (!assertPersonsExist([...(spouseIds ?? []), ...(childIds ?? [])])) {
          throw new Error('包含不存在的人物');
        }
        replaceMembers(id, spouseIds ?? [], childIds ?? []);
      }
    });
    try {
      tx();
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    reply.send({ ok: true });
  });

  app.delete('/api/unions/:id', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = db
      .prepare('UPDATE unions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(now(), now(), id);
    if (!res.changes) return reply.code(404).send({ error: '家庭关系不存在' });
    reply.send({ ok: true });
  });
}
