import type { AuthUser } from './auth.js';

export type Privacy = 'public' | 'family' | 'private';

export interface Privatable {
  privacy?: string | null;
  created_by?: string | null;
}

/**
 * 隐私分级可见性判定：
 * - admin 永远可见
 * - 创建者（owner）永远可见自己的记录
 * - public：所有已登录用户可见
 * - family：家族成员（editor）可见，viewer 不可见
 * - private：仅创建者与 admin 可见
 */
export function canView(row: Privatable, user: AuthUser | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (row.created_by && row.created_by === user.id) return true;
  const privacy = row.privacy ?? 'public';
  if (privacy === 'public') return true;
  if (privacy === 'family') return user.role === 'editor';
  return false;
}
