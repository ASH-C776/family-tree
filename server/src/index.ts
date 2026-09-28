import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { migrate, UPLOAD_DIR } from './db.js';
import { authRoutes } from './routes/auth.js';
import { personRoutes } from './routes/persons.js';
import { unionRoutes } from './routes/unions.js';
import { treeRoutes } from './routes/tree.js';
import { uploadRoutes } from './routes/upload.js';
import { adminRoutes } from './routes/admin.js';
import { mediaRoutes } from './routes/media.js';

migrate();

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 25 * 1024 * 1024 });

  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(authRoutes);
  await app.register(treeRoutes);
  await app.register(personRoutes);
  await app.register(unionRoutes);
  await app.register(uploadRoutes);
  await app.register(adminRoutes);
  await app.register(mediaRoutes);

  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/', decorateReply: false });

  const webDist =
    process.env.WEB_DIST ??
    [
      path.resolve(process.cwd(), 'web/dist'), // cwd = 仓库根 / 容器 /app
      path.resolve(process.cwd(), '../web/dist'), // cwd = server/（开发时从 server 起）
    ].find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  app.get('/api/health', async () => ({ ok: true }));
  return app;
}

const isDirectRun = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
