import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../http.js';
import { canView } from '../acl.js';
import { toPerson, type PersonRow } from '../types.js';

interface UnionRow {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export async function treeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tree', { preHandler: requireAuth }, async (req, reply) => {
    const allPersons = (db
      .prepare('SELECT * FROM persons WHERE deleted_at IS NULL ORDER BY created_at')
      .all() as PersonRow[]);
    const persons = allPersons.filter((p) => canView(p, req.user)).map(toPerson);
    const visibleIds = new Set(persons.map((p) => p.id));

    const members = (db
      .prepare(
        `SELECT m.union_id AS unionId, m.person_id AS personId, m.role AS role, m.order_index AS orderIndex
         FROM union_members m
         JOIN unions u ON u.id = m.union_id AND u.deleted_at IS NULL
         JOIN persons p ON p.id = m.person_id AND p.deleted_at IS NULL`,
      )
      .all() as { unionId: string; personId: string; role: 'spouse' | 'child'; orderIndex: number }[]).filter((m) =>
      visibleIds.has(m.personId),
    );
    const visibleUnionIds = new Set(members.map((m) => m.unionId));

    const unions = (db
      .prepare('SELECT * FROM unions WHERE deleted_at IS NULL ORDER BY created_at')
      .all() as UnionRow[])
      .filter((u) => visibleUnionIds.has(u.id))
      .map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
        note: r.note,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    reply.send({ persons, unions, members });
  });
}
