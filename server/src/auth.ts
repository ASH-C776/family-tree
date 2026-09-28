import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SignJWT, jwtVerify } from 'jose';
import { DATA_DIR } from './db.js';

export type Role = 'admin' | 'editor' | 'viewer';

export type AccountStatus = 'active' | 'pending' | 'disabled';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
}

const secretPath = path.join(DATA_DIR, 'jwt-secret');
let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  cachedSecret = new Uint8Array(Buffer.from(fs.readFileSync(secretPath, 'utf8').trim(), 'hex'));
  return cachedSecret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ username: user.username, displayName: user.displayName, role: user.role, status: user.status })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function readToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      username: String(payload.username ?? ''),
      displayName: String(payload.displayName ?? ''),
      role: (payload.role as Role) ?? 'viewer',
      status: (payload.status as AccountStatus) ?? 'active',
    };
  } catch {
    return null;
  }
}
