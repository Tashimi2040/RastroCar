import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { signToken } from '../../auth/jwt.js';
import { config } from '../../config.js';
import { HttpError, requireUser, audit } from '../context.js';

const attempts = new Map<string, { count: number; until: number }>();

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const key = `${req.ip}:${body.email.toLowerCase()}`;
    const a = attempts.get(key);
    if (a && a.count >= 8 && Date.now() < a.until) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const db = getDb();
    const user = db.get<{ id: number; name: string; email: string; password_hash: string; role: 'admin' | 'operator' | 'client'; client_id: number | null; active: number }>(
      'SELECT * FROM users WHERE email = ?',
      body.email,
    );
    if (!user || !user.active || !verifyPassword(body.password, user.password_hash)) {
      const cur = attempts.get(key) ?? { count: 0, until: 0 };
      cur.count++;
      cur.until = Date.now() + 10 * 60000;
      attempts.set(key, cur);
      throw new HttpError(401, 'E-mail ou senha inválidos');
    }
    attempts.delete(key);
    db.run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), user.id);
    const token = signToken({ sub: user.id, role: user.role, clientId: user.client_id, name: user.name }, config.jwtSecret, config.jwtExpiresHours * 3600);
    const client = user.client_id ? db.get('SELECT id, name FROM clients WHERE id = ?', user.client_id) : null;
    req.user = { sub: user.id, role: user.role, clientId: user.client_id, name: user.name, iat: 0, exp: 0 };
    audit(req, 'login');
    return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.client_id, client } });
  });

  app.get('/api/auth/me', async (req) => {
    const u = requireUser(req);
    const db = getDb();
    const user = db.get('SELECT id, name, email, role, client_id AS clientId, last_login_at AS lastLoginAt FROM users WHERE id = ?', u.sub);
    const client = u.clientId ? db.get('SELECT id, name FROM clients WHERE id = ?', u.clientId) : null;
    return { user: { ...user, client } };
  });

  app.post('/api/auth/change-password', async (req) => {
    const u = requireUser(req);
    const body = z.object({ currentPassword: z.string(), newPassword: z.string().min(6, 'Senha deve ter ao menos 6 caracteres') }).parse(req.body);
    const db = getDb();
    const user = db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', u.sub);
    if (!user || !verifyPassword(body.currentPassword, user.password_hash)) throw new HttpError(400, 'Senha atual incorreta');
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(body.newPassword), Date.now(), u.sub);
    audit(req, 'change_password');
    return { ok: true };
  });
}
