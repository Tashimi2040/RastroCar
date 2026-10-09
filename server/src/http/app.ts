import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { HttpError, authenticate } from './context.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/clients.js';
import { vehicleRoutes } from './routes/vehicles.js';
import { deviceRoutes } from './routes/devices.js';
import { positionRoutes } from './routes/positions.js';
import { tripRoutes } from './routes/trips.js';
import { eventRoutes } from './routes/events.js';
import { geofenceRoutes } from './routes/geofences.js';
import { commandRoutes } from './routes/commands.js';
import { settingsRoutes } from './routes/settings.js';
import { logger } from '../logger.js';

export async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 1024 * 1024 });

  await app.register(cors, { origin: true });
  app.addHook('onRequest', authenticate);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message });
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => `${i.path.join('.') || 'campo'}: ${i.message}`).join('; ');
      return reply.status(400).send({ error: `Dados inválidos: ${msg}` });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) logger.error({ err, url: req.url }, 'erro interno');
    return reply.status(status).send({ error: status >= 500 ? 'Erro interno do servidor' : (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true, time: Date.now(), version: '1.0.0' }));

  await app.register(authRoutes);
  await app.register(clientRoutes);
  await app.register(vehicleRoutes);
  await app.register(deviceRoutes);
  await app.register(positionRoutes);
  await app.register(tripRoutes);
  await app.register(eventRoutes);
  await app.register(geofenceRoutes);
  await app.register(commandRoutes);
  await app.register(settingsRoutes);

  // Front-end compilado (SPA)
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Rota não encontrada' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Rota não encontrada' });
      return reply.status(404).type('text/html').send('<h1>RastroCar API</h1><p>Interface web não compilada. Execute <code>npm run build</code>.</p>');
    });
  }

  return app;
}
