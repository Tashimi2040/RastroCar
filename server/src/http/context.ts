import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload | null;
  }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function authenticate(req: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) {
  req.user = null;
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query as { token?: string })?.token;
  if (token) {
    const payload = verifyToken(token, config.jwtSecret);
    if (payload) {
      const u = getDb().get<{ active: number; role: TokenPayload['role']; client_id: number | null }>('SELECT active, role, client_id FROM users WHERE id = ?', payload.sub);
      if (u && u.active) req.user = { ...payload, role: u.role, clientId: u.client_id };
    }
  }
  done();
}

export function requireUser(req: FastifyRequest): TokenPayload {
  if (!req.user) throw new HttpError(401, 'Não autenticado');
  return req.user;
}

export function requireStaff(req: FastifyRequest): TokenPayload {
  const u = requireUser(req);
  if (u.role !== 'admin' && u.role !== 'operator') throw new HttpError(403, 'Acesso restrito à equipe');
  return u;
}

export function requireAdmin(req: FastifyRequest): TokenPayload {
  const u = requireUser(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Acesso restrito ao administrador');
  return u;
}

/** Retorna o client_id ao qual o usuário está restrito, ou null para equipe (acesso total). */
export function scopeClientId(req: FastifyRequest): number | null {
  const u = requireUser(req);
  if (u.role === 'client') {
    if (!u.clientId) throw new HttpError(403, 'Usuário sem cliente vinculado');
    return u.clientId;
  }
  return null;
}

/** Garante que o veículo pertence ao escopo do usuário. */
export function assertVehicleAccess(req: FastifyRequest, vehicleId: number) {
  const scope = scopeClientId(req);
  const v = getDb().get<{ id: number; client_id: number }>('SELECT id, client_id FROM vehicles WHERE id = ?', vehicleId);
  if (!v) throw new HttpError(404, 'Veículo não encontrado');
  if (scope !== null && v.client_id !== scope) throw new HttpError(403, 'Sem acesso a este veículo');
  return v;
}

export function assertDeviceAccess(req: FastifyRequest, deviceId: number) {
  const scope = scopeClientId(req);
  const d = getDb().get<{ id: number; vehicle_id: number | null; imei: string; client_id: number | null }>(
    'SELECT d.id, d.vehicle_id, d.imei, v.client_id FROM devices d LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE d.id = ?',
    deviceId,
  );
  if (!d) throw new HttpError(404, 'Rastreador não encontrado');
  if (scope !== null && d.client_id !== scope) throw new HttpError(403, 'Sem acesso a este rastreador');
  return d;
}

export function intParam(value: unknown, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Parâmetro ${name} inválido`);
  return n;
}

export function parseRange(q: { from?: string; to?: string }, defaultHours = 24): { from: number; to: number } {
  const to = q.to ? Number(new Date(q.to)) : Date.now();
  const from = q.from ? Number(new Date(q.from)) : to - defaultHours * 3600000;
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new HttpError(400, 'Período inválido');
  if (to - from > 93 * 86400000) throw new HttpError(400, 'Período máximo de 93 dias');
  return { from, to };
}

export function audit(req: FastifyRequest, action: string, entity?: string, entityId?: number, details?: unknown) {
  getDb().run(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    req.user?.sub ?? null,
    action,
    entity ?? null,
    entityId ?? null,
    details ? JSON.stringify(details) : null,
    req.ip,
    Date.now(),
  );
}
