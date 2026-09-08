import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Carrega .env simples (sem dependência externa) se existir na raiz do projeto ou em server/
for (const candidate of [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../.env'), path.resolve(process.cwd(), '.env')]) {
  if (fs.existsSync(candidate)) {
    for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawVal.replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

const dataDir = path.resolve(env('DATA_DIR', path.resolve(__dirname, '../../data')));
fs.mkdirSync(dataDir, { recursive: true });

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  httpHost: env('HTTP_HOST', '0.0.0.0'),
  httpPort: envInt('PORT', envInt('HTTP_PORT', 3000)),
  /** Porta TCP única com detecção automática de protocolo (GT06 / H02 / TK103). */
  tcpPort: envInt('TCP_PORT', 5023),
  /** Porta TCP pública a informar aos rastreadores (difere da interna quando há proxy TCP, ex.: Railway). */
  publicTcpPort: envInt('PUBLIC_TCP_PORT', envInt('TCP_PORT', 5023)),
  /** Portas dedicadas opcionais por protocolo (0 = desligado). */
  tcpPortGt06: Number(process.env.TCP_PORT_GT06 ?? 0),
  tcpPortH02: Number(process.env.TCP_PORT_H02 ?? 0),
  tcpPortTk103: Number(process.env.TCP_PORT_TK103 ?? 0),
  dataDir,
  dbPath: env('DB_PATH', path.join(dataDir, 'rastrocar.db')),
  jwtSecret: env('JWT_SECRET', ''),
  jwtExpiresHours: envInt('JWT_EXPIRES_HOURS', 24 * 7),
  adminEmail: env('ADMIN_EMAIL', 'admin@rastrocar.local'),
  adminPassword: env('ADMIN_PASSWORD', 'admin123'),
  adminName: env('ADMIN_NAME', 'Administrador'),
  /** Host público que os rastreadores devem usar (exibido nas instruções de configuração). */
  publicHost: env('PUBLIC_HOST', ''),
  webDist: path.resolve(__dirname, '../../web/dist'),
  /** Aceitar posições de IMEIs desconhecidos, criando o dispositivo automaticamente como "pendente". */
  autoRegisterDevices: env('AUTO_REGISTER_DEVICES', 'true') !== 'false',
  logLevel: env('LOG_LEVEL', 'info'),
  timezone: env('TZ', 'America/Sao_Paulo'),
};

export type Config = typeof config;
