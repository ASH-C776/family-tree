import type { FastifyInstance } from 'fastify';
import { db, newId, now } from '../db.js';
import { requireAuth, requireRole } from '../http.js';
import { toPerson, type Gender, type PersonRow, type Privacy } from '../types.js';

interface PersonInput {
  name?: string;
  gender?: Gender;
  birthDate?: string | null;
  birthPrecision?: string | null;
  birthCirca?: boolean;
  deathDate?: string | null;
  deathPrecision?: string | null;
  deathCirca?: boolean;
  isAlive?: boolean;
  avatar?: string | null;
  bio?: string | null;
  phone?: string | null;
  address?: string | null;
  birthOrder?: number | null;
  privacy?: Privacy;
  expectedUpdatedAt?: number;
}

const UPDATABLE: Record<string, string> = {
  name: 'name',
  gender: 'gender',
  birthDate: 'birth_date',
  birthPrecision: 'birth_precision',
  birthCirca: 'birth_circa',
  deathDate: 'death_date',
  deathPrecision: 'death_precision',
  deathCirca: 'death_circa',
  isAlive: 'is_alive',
  avatar: 'avatar',
  bio: 'bio',
  phone: 'phone',
  address: 'address',
  birthOrder: 'birth_order',
  privacy: 'privacy',
};

function boolToInt(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  return v ? 1 : 0;
}

export async function personRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/persons', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const body = (req.body ?? {}) as PersonInput;
    const name = (body.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: '姓名必填' });
    const id = newId('p');
    const ts = now();
    const privacy = body.privacy ?? 'public';
    db.prepare(
      `INSERT INTO persons (id, name, gender, birth_date, birth_precision, birth_circa, death_date, death_precision,
        death_circa, is_alive, avatar, bio, phone, address, birth_order, privacy, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      body.gender ?? 'unknown',
      body.birthDate ?? null,
      body.birthPrecision ?? null,
      boolToInt(body.birthCirca) ?? 0,
      body.deathDate ?? null,
      body.deathPrecision ?? null,
      boolToInt(body.deathCirca) ?? 0,
      boolToInt(body.isAlive ?? true) ?? 1,
      body.avatar ?? null,
      body.bio ?? null,
      body.phone ?? null,
      body.address ?? null,
      body.birthOrder ?? null,
      privacy,
      req.user!.id,
      req.user!.id,
      ts,
      ts,
    );
    reply.send({ person: toPerson(db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as PersonRow) });
  });

  app.patch('/api/persons/:id', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as PersonInput;
    const row = db.prepare('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL').get(id) as PersonRow | undefined;
    if (!row) return reply.code(404).send({ error: '人物不存在' });
    if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) {
      return reply.code(409).send({ error: '这条记录已被其他人修改过，请刷新后再保存', current: toPerson(row) });
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(UPDATABLE)) {
      const value = (body as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    if (!sets.length) return reply.code(400).send({ error: '没有需要更新的字段' });
    sets.push('updated_at = ?', 'updated_by = ?');
    values.push(now(), req.user!.id, id);
    db.prepare(`UPDATE persons SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
    reply.send({ person: toPerson(db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as PersonRow) });
  });

  app.delete('/api/persons/:id', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const res = db
      .prepare('UPDATE persons SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL')
      .run(ts, ts, req.user!.id, id);
    if (!res.changes) return reply.code(404).send({ error: '人物不存在' });
    reply.send({ ok: true });
  });

  app.get('/api/trash', { preHandler: requireAuth }, async (_req, reply) => {
    const rows = db
      .prepare('SELECT * FROM persons WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all() as PersonRow[];
    reply.send({ persons: rows.map(toPerson) });
  });

  app.post('/api/trash/:id/restore', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = db
      .prepare('UPDATE persons SET deleted_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(now(), req.user!.id, id);
    if (!res.changes) return reply.code(404).send({ error: '记录不存在' });
    reply.send({ ok: true });
  });

  app.delete('/api/trash/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM union_members WHERE person_id = ?').run(id);
      db.prepare('DELETE FROM media WHERE person_id = ?').run(id);
      db.prepare('DELETE FROM persons WHERE id = ?').run(id);
    });
    tx();
    reply.send({ ok: true });
  });
}
