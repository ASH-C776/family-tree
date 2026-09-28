export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type DatePrecision = 'day' | 'month' | 'year';
export type UnionStatus = 'married' | 'divorced' | 'other';
export type MemberRole = 'spouse' | 'child';
export type Privacy = 'public' | 'family' | 'private';

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  birthDate: string | null;
  birthPrecision: DatePrecision | null;
  birthCirca: boolean;
  deathDate: string | null;
  deathPrecision: DatePrecision | null;
  deathCirca: boolean;
  isAlive: boolean;
  avatar: string | null;
  bio: string | null;
  phone: string | null;
  address: string | null;
  birthOrder: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  privacy: Privacy;
  createdAt: number;
  updatedAt: number;
}

export interface Union {
  id: string;
  status: UnionStatus;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UnionMember {
  unionId: string;
  personId: string;
  role: MemberRole;
  orderIndex: number;
}

export interface TreeData {
  persons: Person[];
  unions: Union[];
  members: UnionMember[];
}

export type UserRole = 'admin' | 'editor' | 'viewer';
export type AccountStatus = 'active' | 'pending' | 'disabled';
export type RegistrationMode = 'closed' | 'invite' | 'apply';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: AccountStatus;
}

export interface Media {
  id: string;
  personId: string;
  kind: string;
  url: string;
  thumbUrl: string;
  caption: string | null;
  privacy: Privacy;
  takenAt: number | null;
  createdAt: number;
}

export interface Invite {
  id: string;
  code: string;
  role: UserRole;
  note: string | null;
  createdAt: number;
  expiresAt: number | null;
  usedByName: string | null;
  usedAt: number | null;
}

export interface Settings {
  registrationMode: RegistrationMode;
  siteTitle: string;
}

export type Direction = 'TB' | 'LR';

export interface PersonPatch {
  name?: string;
  gender?: Gender;
  birthDate?: string | null;
  birthPrecision?: DatePrecision | null;
  birthCirca?: boolean;
  deathDate?: string | null;
  deathPrecision?: DatePrecision | null;
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
