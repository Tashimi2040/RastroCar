import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { hashPassword } from './auth/password.js';
import { buildApp } from './http/app.js';
import { hub } from './ws/hub.js';
import { startGateway } from './gateway/tcp.js';
import { warmUpRuntimes, checkOfflineDevices, purgeOldPositions } from './services/tracking.js';
import { expireStaleCommands } from './services/commands.js';
import { logger } from './logger.js';

function ensureJwtSecret() {
  if (config.jwtSecret) return;
  const secretFile = path.join(config.dataDir, '.jwt-secret');
  if (fs.existsSync(secretFile)) {
    config.jwtSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    config.jwtSecret = randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, config.jwtSecret, { mode: 0o600 });
    logger.warn('JWT_SECRET não definido; segredo gerado e salvo em data/.jwt-secret');
  }
}

function ensureAdmin() {
  const db = getDb();
  const count = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")!.n;
  if (count > 0) return;
  const now = Date.now();
  db.run(
    "INSERT INTO users (name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?)",
    config.adminName,
    config.adminEmail,
    hashPassword(config.adminPassword),
    now,
    now,
  );
  logger.warn({ email: config.adminEmail }, 'usuário administrador inicial criado — altere a senha após o primeiro acesso');
}

async function main() {
  ensureJwtSecret();
  getDb();
  ensureAdmin();
  warmUpRuntimes();

  const app = await buildApp();
  await app.ready();
  hub.attach(app.server);
  await app.listen({ host: config.httpHost, port: config.httpPort });
  logger.info({ port: config.httpPort }, 'servidor http/ws ouvindo');

  const gateways = await startGateway([
    { port: config.tcpPort, protocol: 'auto' },
    { port: config.tcpPortGt06, protocol: 'gt06' },
    { port: config.tcpPortH02, protocol: 'h02' },
    { port: config.tcpPortTk103, protocol: 'tk103' },
  ]);

  const timers = [
    setInterval(() => {
      try {
        checkOfflineDevices();
      } catch (err) {
        logger.error({ err }, 'erro na verificação de offline');
      }
    }, 60000),
    setInterval(() => {
      try {
        const purged = purgeOldPositions();
        if (purged) logger.info({ purged }, 'posições antigas removidas');
        expireStaleCommands();
      } catch (err) {
        logger.error({ err }, 'erro na manutenção periódica');
      }
    }, 6 * 3600000),
  ];

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'encerrando');
    for (const t of timers) clearInterval(t);
    hub.close();
    for (const g of gateways) g.server.close();
    await app.close();
    getDb().close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'falha ao iniciar');
  process.exit(1);
});
