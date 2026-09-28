import type { FastifyReply, FastifyRequest } from 'fastify';
import { readToken, type AuthUser, type Role } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? await readToken(token) : null;
  if (!user) {
    reply.code(401).send({ error: '未登录或登录已过期' });
    return;
  }
  req.user = user;
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      reply.code(401).send({ error: '未登录' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      reply.code(403).send({ error: '权限不足' });
    }
  };
}

export function badRequest(reply: FastifyReply, message: string): void {
  reply.code(400).send({ error: message });
}
