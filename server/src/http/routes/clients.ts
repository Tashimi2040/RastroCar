import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { hashPassword } from '../../auth/password.js';
import { HttpError, requireAdmin, requireStaff, intParam, audit } from '../context.js';

const clientSchema = z.object({
  name: z.string().min(2),
  document: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'operator', 'client']),
  clientId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});

export async function clientRoutes(app: FastifyInstance) {
  app.get('/api/clients', async (req) => {
    requireStaff(req);
    const q = (req.query as { search?: string }).search?.trim();
    const db = getDb();
    const rows = db.all(
      `SELECT c.*,
        (SELECT COUNT(*) FROM vehicles v WHERE v.client_id = c.id) AS vehicles_count,
        (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) AS users_count,
        (SELECT COUNT(*) FROM devices d JOIN vehicles v ON v.id = d.vehicle_id WHERE v.client_id = c.id) AS devices_count
       FROM clients c
       WHERE (? IS NULL OR c.name LIKE ? OR c.document LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)
       ORDER BY c.name`,
      q ?? null,
      `%${q ?? ''}%`,
      `%${q ?? ''}%`,
      `%${q ?? ''}%`,
      `%${q ?? ''}%`,
    );
    return rows;
  });

  app.get('/api/clients/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const db = getDb();
    const client = db.get('SELECT * FROM clients WHERE id = ?', id);
    if (!client) throw new HttpError(404, 'Cliente não encontrado');
    const vehicles = db.all(
      `SELECT v.*, d.id AS device_id, d.imei, d.last_seen_at FROM vehicles v LEFT JOIN devices d ON d.vehicle_id = v.id WHERE v.client_id = ? ORDER BY v.name`,
      id,
    );
    const users = db.all('SELECT id, name, email, role, active, last_login_at FROM users WHERE client_id = ? ORDER BY name', id);
    return { ...client, vehicles, users };
  });

  app.post('/api/clients', async (req) => {
    requireStaff(req);
    const body = clientSchema.parse(req.body);
    const now = Date.now();
    const r = getDb().run(
      'INSERT INTO clients (name, document, phone, email, address, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      body.name,
      body.document ?? null,
      body.phone ?? null,
      body.email || null,
      body.address ?? null,
      body.notes ?? null,
      body.active === false ? 0 : 1,
      now,
      now,
    );
    audit(req, 'create', 'client', r.lastId, body);
    return getDb().get('SELECT * FROM clients WHERE id = ?', r.lastId);
  });

  app.put('/api/clients/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const body = clientSchema.partial().parse(req.body);
    const db = getDb();
    const existing = db.get<Record<string, unknown>>('SELECT * FROM clients WHERE id = ?', id);
    if (!existing) throw new HttpError(404, 'Cliente não encontrado');
    db.run(
      'UPDATE clients SET name = ?, document = ?, phone = ?, email = ?, address = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?',
      body.name ?? (existing.name as string),
      body.document === undefined ? (existing.document as string | null) : body.document,
      body.phone === undefined ? (existing.phone as string | null) : body.phone,
      body.email === undefined ? (existing.email as string | null) : body.email || null,
      body.address === undefined ? (existing.address as string | null) : body.address,
      body.notes === undefined ? (existing.notes as string | null) : body.notes,
      body.active === undefined ? (existing.active as number) : body.active ? 1 : 0,
      Date.now(),
      id,
    );
    audit(req, 'update', 'client', id, body);
    return db.get('SELECT * FROM clients WHERE id = ?', id);
  });

  app.delete('/api/clients/:id', async (req) => {
    requireAdmin(req);
    const id = intParam((req.params as { id: string }).id);
    const r = getDb().run('DELETE FROM clients WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, 'Cliente não encontrado');
    audit(req, 'delete', 'client', id);
    return { ok: true };
  });

  // ---- Usuários ----
  app.get('/api/users', async (req) => {
    requireStaff(req);
    return getDb().all(
      'SELECT u.id, u.name, u.email, u.role, u.client_id, u.active, u.last_login_at, u.created_at, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id = u.client_id ORDER BY u.role, u.name',
    );
  });

  app.post('/api/users', async (req) => {
    const me = requireStaff(req);
    const body = userSchema.parse(req.body);
    if (body.role !== 'client' && me.role !== 'admin') throw new HttpError(403, 'Somente administradores criam usuários da equipe');
    if (body.role === 'client' && !body.clientId) throw new HttpError(400, 'Usuário do tipo cliente precisa de um cliente vinculado');
    if (!body.password) throw new HttpError(400, 'Senha é obrigatória');
    const db = getDb();
    if (db.get('SELECT id FROM users WHERE email = ?', body.email)) throw new HttpError(409, 'E-mail já cadastrado');
    const now = Date.now();
    const r = db.run(
      'INSERT INTO users (client_id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      body.role === 'client' ? body.clientId! : null,
      body.name,
      body.email,
      hashPassword(body.password),
      body.role,
      body.active === false ? 0 : 1,
      now,
      now,
    );
    audit(req, 'create', 'user', r.lastId, { email: body.email, role: body.role });
    return db.get('SELECT id, name, email, role, client_id, active FROM users WHERE id = ?', r.lastId);
  });

  app.put('/api/users/:id', async (req) => {
    const me = requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const body = userSchema.partial().parse(req.body);
    const db = getDb();
    const existing = db.get<{ id: number; role: string; client_id: number | null; name: string; email: string; active: number }>('SELECT * FROM users WHERE id = ?', id);
    if (!existing) throw new HttpError(404, 'Usuário não encontrado');
    if ((existing.role !== 'client' || (body.role && body.role !== 'client')) && me.role !== 'admin') throw new HttpError(403, 'Somente administradores alteram usuários da equipe');
    if (body.email && body.email.toLowerCase() !== existing.email.toLowerCase() && db.get('SELECT id FROM users WHERE email = ?', body.email)) throw new HttpError(409, 'E-mail já cadastrado');
    const role = body.role ?? existing.role;
    if (id === me.sub && role !== 'admin' && me.role === 'admin') throw new HttpError(400, 'Você não pode remover seu próprio acesso de administrador');
    db.run(
      'UPDATE users SET name = ?, email = ?, role = ?, client_id = ?, active = ?, updated_at = ? WHERE id = ?',
      body.name ?? existing.name,
      body.email ?? existing.email,
      role,
      role === 'client' ? (body.clientId === undefined ? existing.client_id : body.clientId) : null,
      body.active === undefined ? existing.active : body.active ? 1 : 0,
      Date.now(),
      id,
    );
    if (body.password) db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.password), id);
    audit(req, 'update', 'user', id, { role, active: body.active });
    return db.get('SELECT id, name, email, role, client_id, active FROM users WHERE id = ?', id);
  });

  app.delete('/api/users/:id', async (req) => {
    const me = requireAdmin(req);
    const id = intParam((req.params as { id: string }).id);
    if (id === me.sub) throw new HttpError(400, 'Você não pode excluir seu próprio usuário');
    const r = getDb().run('DELETE FROM users WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, 'Usuário não encontrado');
    audit(req, 'delete', 'user', id);
    return { ok: true };
  });
}
