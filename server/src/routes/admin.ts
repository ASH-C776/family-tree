import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db, getSetting, newId, now, setSetting } from '../db.js';
import { hashPassword, type Role } from '../auth.js';
import { requireAuth, requireRole } from '../http.js';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];
const MODES = ['closed', 'invite', 'apply'];

interface InviteRow {
  id: string;
  code: string;
  role: string;
  note: string | null;
  created_by: string | null;
  created_at: number;
  expires_at: number | null;
  used_by: string | null;
  used_at: number | null;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', { preHandler: requireAuth }, async (_req, reply) => {
    reply.send({
      registrationMode: getSetting('registration_mode', 'invite'),
      siteTitle: getSetting('site_title', '家谱'),
    });
  });

  app.put('/api/settings', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const body = (req.body ?? {}) as { registrationMode?: string; siteTitle?: string };
    if (body.registrationMode && !MODES.includes(body.registrationMode)) {
      return reply.code(400).send({ error: '注册模式不合法' });
    }
    if (body.registrationMode) setSetting('registration_mode', body.registrationMode);
    if (body.siteTitle) setSetting('site_title', body.siteTitle);
    reply.send({ ok: true });
  });

  app.get('/api/invites', { preHandler: [requireAuth, requireRole('admin')] }, async (_req, reply) => {
    const rows = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all() as InviteRow[];
    const users = new Map(
      (db.prepare('SELECT id, display_name FROM users').all() as { id: string; display_name: string }[]).map((u) => [
        u.id,
        u.display_name,
      ]),
    );
    reply.send({
      invites: rows.map((r) => ({
        id: r.id,
        code: r.code,
        role: r.role,
        note: r.note,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        usedByName: r.used_by ? users.get(r.used_by) ?? null : null,
        usedAt: r.used_at,
      })),
    });
  });

  app.post('/api/invites', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const body = (req.body ?? {}) as { role?: Role; note?: string; expiresInDays?: number };
    const role: Role = body.role && ROLES.includes(body.role) ? body.role : 'editor';
    const id = newId('iv');
    const code = crypto.randomBytes(6).toString('base64url');
    const expiresAt = body.expiresInDays ? now() + body.expiresInDays * 86400_000 : null;
    db.prepare(
      'INSERT INTO invites (id, code, role, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, code, role, body.note ?? null, req.user!.id, now(), expiresAt);
    reply.send({ invite: { id, code, role, expiresAt } });
  });

  app.delete('/api/invites/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM invites WHERE id = ?').run(id);
    reply.send({ ok: true });
  });

  app.patch('/api/users/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { role?: Role; status?: string; password?: string };
    if (id === req.user!.id) return reply.code(400).send({ error: '不能修改自己的角色或状态' });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as { id: string; role: string } | undefined;
    if (!row) return reply.code(404).send({ error: '用户不存在' });

    if (body.role && !ROLES.includes(body.role)) return reply.code(400).send({ error: '角色不合法' });
    if (body.status && !['active', 'pending', 'disabled'].includes(body.status)) {
      return reply.code(400).send({ error: '状态不合法' });
    }

    const demoteSelfAdmin = row.role === 'admin' && (body.role !== 'admin' || body.status !== 'active');
    if (demoteSelfAdmin) {
      const adminCount = (db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active'")
        .get() as { c: number }).c;
      if (adminCount <= 1) return reply.code(400).send({ error: '至少要保留一个可用的管理员' });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.role) {
      sets.push('role = ?');
      values.push(body.role);
    }
    if (body.status) {
      sets.push('status = ?');
      values.push(body.status);
    }
    if (body.password) {
      if (body.password.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
      sets.push('password_hash = ?');
      values.push(hashPassword(body.password));
    }
    if (!sets.length) return reply.code(400).send({ error: '没有需要修改的内容' });
    values.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
    reply.send({ ok: true });
  });

  app.delete('/api/users/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user!.id) return reply.code(400).send({ error: '不能删除自己' });
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
    if (!row) return reply.code(404).send({ error: '用户不存在' });
    if (row.role === 'admin') {
      const adminCount = (db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active'")
        .get() as { c: number }).c;
      if (adminCount <= 1) return reply.code(400).send({ error: '至少要保留一个可用的管理员' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    reply.send({ ok: true });
  });
}
