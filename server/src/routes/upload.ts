import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { UPLOAD_DIR, newId } from '../db.js';
import { requireAuth, requireRole } from '../http.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/upload', { preHandler: [requireAuth, requireRole('admin', 'editor')] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: '没有收到文件' });
    const ext = EXT_BY_MIME[data.mimetype];
    if (!ext) {
      await data.file.resume();
      return reply.code(400).send({ error: '只支持 JPG / PNG / WebP / GIF 图片' });
    }
    const filename = `${newId('img')}.${ext}`;
    const target = path.join(UPLOAD_DIR, filename);
    await pipeline(data.file, fs.createWriteStream(target));
    reply.send({ url: `/uploads/${filename}` });
  });
}
