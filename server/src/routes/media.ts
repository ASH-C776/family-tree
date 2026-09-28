import type { FastifyInstance } from 'fastify';
import { db, newId, now } from '../db.js';
import { requireAuth, requireRole } from '../http.js';
import { canView, type Privacy } from '../acl.js';

interface MediaRow {
  id: string;
  person_id: string;
  kind: string;
  path: string;
  thumb_path: string | null;
  caption: string | null;
  privacy: string;
  taken_at: number | null;
  created_at: number;
}

function toMedia(row: MediaRow) {
  return {
    id: row.id,
    personId: row.person_id,
    kind: row.kind,
    url: row.path,
    thumbUrl: row.thumb_path ?? row.path,
    caption: row.caption,
    privacy: (row.privacy as Privacy) ?? 'public',
    takenAt: row.taken_at ?? null,
    createdAt: row.created_at,
  };
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/persons/:id/media', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const person = db.prepare('SELECT id, privacy, created_by FROM persons WHERE id = ? AND deleted_at IS NULL').get(id) as
      | { id: string; privacy: string; created_by: string | null }
      | undefined;
    if (!person) return reply.code(404).send({ error: '人物不存在' });
    // 连人物本身都不可见的用户，也不应看到其照片
    if (!canView(person, req.user)) return reply.send({ media: [] });
    const rows = db
      .prepare('SELECT * FROM media WHERE person_id = ? AND deleted_at IS NULL ORDER BY COALESCE(taken_at, created_at)')
      .all(id) as MediaRow[];
    const visible = rows.filter((r) => canView(r, req.user));
    reply.send({ media: visible.map(toMedia) });
  });

  app.post('/api/media', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      personId?: string;
      path?: string;
      thumbPath?: string;
      caption?: string;
      privacy?: Privacy;
      takenAt?: number | null;
    };
    if (!body.personId || !body.path) return reply.code(400).send({ error: '缺少人物或文件路径' });
    const person = db.prepare('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL').get(body.personId);
    if (!person) return reply.code(404).send({ error: '人物不存在' });
    const id = newId('m');
    db.prepare(
      'INSERT INTO media (id, person_id, kind, path, thumb_path, caption, privacy, taken_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      body.personId,
      'photo',
      body.path,
      body.thumbPath ?? null,
      body.caption ?? null,
      body.privacy ?? 'public',
      body.takenAt ?? null,
      now(),
    );
    reply.send({ media: toMedia(db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow) });
  });

  app.delete('/api/media/:id', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = db.prepare('UPDATE media SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now(), id);
    if (!res.changes) return reply.code(404).send({ error: '照片不存在' });
    reply.send({ ok: true });
  });
}
