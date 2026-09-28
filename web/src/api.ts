import type {
  AccountStatus,
  AuthUser,
  Invite,
  Media,
  Person,
  PersonPatch,
  Privacy,
  RegistrationMode,
  Settings,
  TreeData,
  Union,
  UnionStatus,
  UserRole,
} from './types';

const TOKEN_KEY = 'ft_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (res.status === 401) {
    setToken('');
    window.dispatchEvent(new Event('ft:unauthorized'));
    throw new ApiError(401, '登录已过期，请重新登录');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data.error ?? `请求失败（${res.status}）`);
  return data as T;
}

export const api = {
  state: () => request<{ initialized: boolean; registrationMode: RegistrationMode; siteTitle: string }>('/api/auth/state'),
  bootstrap: (username: string, password: string, displayName: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  register: (payload: { username: string; password: string; displayName?: string; code?: string }) =>
    request<{ token?: string; user?: AuthUser; pending?: boolean; message?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  users: () => request<{ users: AuthUser[] }>('/api/users'),
  createUser: (payload: { username: string; password: string; displayName?: string; role?: string }) =>
    request<{ user: AuthUser }>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: { role?: UserRole; status?: AccountStatus; password?: string }) =>
    request<{ ok: boolean }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),

  settings: () => request<Settings>('/api/settings'),
  updateSettings: (payload: { registrationMode?: RegistrationMode; siteTitle?: string }) =>
    request<{ ok: boolean }>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  invites: () => request<{ invites: Invite[] }>('/api/invites'),
  createInvite: (payload: { role?: UserRole; note?: string; expiresInDays?: number }) =>
    request<{ invite: { id: string; code: string; role: UserRole; expiresAt: number | null } }>('/api/invites', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteInvite: (id: string) => request<{ ok: boolean }>(`/api/invites/${id}`, { method: 'DELETE' }),

  personMedia: (personId: string) => request<{ media: Media[] }>(`/api/persons/${personId}/media`),
  addMedia: (payload: { personId: string; path: string; thumbPath?: string; caption?: string; privacy?: Privacy; takenAt?: number | null }) =>
    request<{ media: Media }>('/api/media', { method: 'POST', body: JSON.stringify(payload) }),
  deleteMedia: (id: string) => request<{ ok: boolean }>(`/api/media/${id}`, { method: 'DELETE' }),

  tree: () => request<TreeData>('/api/tree'),

  createPerson: (payload: Partial<Person>) => request<{ person: Person }>('/api/persons', { method: 'POST', body: JSON.stringify(payload) }),
  updatePerson: (id: string, patch: PersonPatch) =>
    request<{ person: Person }>(`/api/persons/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePerson: (id: string) => request<{ ok: boolean }>(`/api/persons/${id}`, { method: 'DELETE' }),

  trash: () => request<{ persons: Person[] }>('/api/trash'),
  restorePerson: (id: string) => request<{ ok: boolean }>(`/api/trash/${id}/restore`, { method: 'POST' }),
  purgePerson: (id: string) => request<{ ok: boolean }>(`/api/trash/${id}`, { method: 'DELETE' }),

  createUnion: (payload: { spouseIds: string[]; childIds?: string[]; status?: UnionStatus }) =>
    request<{ union: Union }>('/api/unions', { method: 'POST', body: JSON.stringify(payload) }),
  updateUnion: (id: string, payload: { spouseIds?: string[]; childIds?: string[]; status?: UnionStatus; note?: string | null }) =>
    request<{ ok: boolean }>(`/api/unions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUnion: (id: string) => request<{ ok: boolean }>(`/api/unions/${id}`, { method: 'DELETE' }),

  upload: async (file: Blob): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('/api/upload', { method: 'POST', body: form });
  },
};
