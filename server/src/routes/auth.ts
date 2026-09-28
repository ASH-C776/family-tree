import type { FastifyInstance } from 'fastify';
import { db, getSetting, newId, now } from '../db.js';
import { hashPassword, signToken, verifyPassword, type AccountStatus, type AuthUser, type Role } from '../auth.js';
import { requireAuth, requireRole } from '../http.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  status: string;
  created_at: number;
}

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as Role,
    status: row.status as AccountStatus,
  };
}

const STATUS_MESSAGE: Record<string, string> = {
  pending: '账号还在等待管理员审核，请稍后再试',
  disabled: '账号已被停用，请联系管理员',
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/state', async (_req, reply) => {
    const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    reply.send({
      initialized: count > 0,
      registrationMode: getSetting('registration_mode', 'invite'),
      siteTitle: getSetting('site_title', '家谱'),
    });
  });

  app.post('/api/auth/bootstrap', async (req, reply) => {
    const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    if (count > 0) return reply.code(409).send({ error: '管理员已存在' });
    const body = (req.body ?? {}) as { username?: string; password?: string; displayName?: string };
    if (!body.username || !body.password) return reply.code(400).send({ error: '用户名与密码必填' });
    const id = newId('u');
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, body.username, hashPassword(body.password), body.displayName ?? body.username, 'admin', 'active', now());
    const user = toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow);
    reply.send({ token: await signToken(user), user });
  });

  app.post('/api/auth/register', async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string; displayName?: string; code?: string };
    if (!body.username || !body.password) return reply.code(400).send({ error: '用户名与密码必填' });
    if (body.password.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(body.username)) {
      return reply.code(409).send({ error: '用户名已存在' });
    }

    const mode = getSetting('registration_mode', 'invite');
    let role: Role = 'viewer';
    let status: AccountStatus = 'pending';

    if (mode === 'closed') {
      return reply.code(403).send({ error: '当前不接受新账号注册，请联系管理员' });
    }
    if (mode === 'invite') {
      const code = (body.code ?? '').trim();
      if (!code) return reply.code(400).send({ error: '请填写邀请码' });
      const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(code) as
        | { id: string; role: string; expires_at: number | null; used_by: string | null }
        | undefined;
      if (!invite) return reply.code(400).send({ error: '邀请码无效' });
      if (invite.used_by) return reply.code(400).send({ error: '邀请码已被使用' });
      if (invite.expires_at && invite.expires_at < now()) return reply.code(400).send({ error: '邀请码已过期' });
      role = invite.role as Role;
      status = 'active';
      const id = newId('u');
      const tx = db.transaction(() => {
        db.prepare(
          'INSERT INTO users (id, username, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(id, body.username, hashPassword(body.password!), body.displayName ?? body.username, role, status, now());
        db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(id, now(), invite.id);
      });
      tx();
      const user = toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow);
      return reply.send({ token: await signToken(user), user });
    }

    const id = newId('u');
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, body.username, hashPassword(body.password), body.displayName ?? body.username, 'viewer', 'pending', now());
    reply.send({ pending: true, message: '已提交，等待管理员审核通过后才能登录' });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string };
    const row = body.username
      ? (db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as UserRow | undefined)
      : undefined;
    if (!row || !verifyPassword(body.password ?? '', row.password_hash)) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }
    if (row.status !== 'active') {
      return reply.code(403).send({ error: STATUS_MESSAGE[row.status] ?? '账号不可用' });
    }
    const user = toUser(row);
    reply.send({ token: await signToken(user), user });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow | undefined;
    if (!row) return reply.code(404).send({ error: '用户不存在' });
    reply.send({ user: toUser(row) });
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow | undefined;
    if (!row) return reply.code(404).send({ error: '用户不存在' });
    if (!verifyPassword(body.oldPassword ?? '', row.password_hash)) {
      return reply.code(400).send({ error: '原密码不正确' });
    }
    if (!body.newPassword || body.newPassword.length < 6) {
      return reply.code(400).send({ error: '新密码至少 6 位' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), row.id);
    reply.send({ ok: true });
  });

  app.post('/api/users', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string; displayName?: string; role?: Role };
    if (!body.username || !body.password) return reply.code(400).send({ error: '用户名与密码必填' });
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(body.username)) {
      return reply.code(409).send({ error: '用户名已存在' });
    }
    const id = newId('u');
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, body.username, hashPassword(body.password), body.displayName ?? body.username, body.role ?? 'editor', 'active', now());
    reply.send({ user: toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow) });
  });

  app.get('/api/users', { preHandler: [requireAuth, requireRole('admin')] }, async (_req, reply) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
    reply.send({ users: rows.map(toUser) });
  });
}
