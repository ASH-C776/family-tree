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
  privacy: string;
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

export interface PersonRow {
  id: string;
  name: string;
  gender: string;
  birth_date: string | null;
  birth_precision: string | null;
  birth_circa: number;
  death_date: string | null;
  death_precision: string | null;
  death_circa: number;
  is_alive: number;
  avatar: string | null;
  bio: string | null;
  phone: string | null;
  address: string | null;
  birth_order: number | null;
  created_by: string | null;
  updated_by: string | null;
  privacy: string;
  created_at: number;
  updated_at: number;
}

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender as Gender,
    birthDate: row.birth_date,
    birthPrecision: row.birth_precision as DatePrecision | null,
    birthCirca: !!row.birth_circa,
    deathDate: row.death_date,
    deathPrecision: row.death_precision as DatePrecision | null,
    deathCirca: !!row.death_circa,
    isAlive: !!row.is_alive,
    avatar: row.avatar,
    bio: row.bio,
    phone: row.phone,
    address: row.address,
    birthOrder: row.birth_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    privacy: (row.privacy as Privacy) ?? 'public',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
