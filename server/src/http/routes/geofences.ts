import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { HttpError, requireUser, scopeClientId, intParam, audit } from '../context.js';

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('circle'), center: latLng, radius: z.number().min(20).max(200000) }),
  z.object({ type: z.literal('polygon'), points: z.array(latLng).min(3).max(500) }),
]);

const schema = z.object({
  clientId: z.number().int().positive().optional(),
  vehicleId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  geometry: geometrySchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  alertOnEnter: z.boolean().optional(),
  alertOnExit: z.boolean().optional(),
  active: z.boolean().optional(),
});

function parse(row: Record<string, any>) {
  return { ...row, geometry: JSON.parse(row.geometry) };
}

export async function geofenceRoutes(app: FastifyInstance) {
  app.get('/api/geofences', async (req) => {
    const scope = scopeClientId(req);
    const q = req.query as { clientId?: string };
    const clientId = scope ?? (q.clientId ? intParam(q.clientId, 'clientId') : null);
    return getDb()
      .all<Record<string, any>>(
        'SELECT g.*, v.name AS vehicle_name, c.name AS client_name FROM geofences g LEFT JOIN vehicles v ON v.id = g.vehicle_id JOIN clients c ON c.id = g.client_id WHERE (? IS NULL OR g.client_id = ?) ORDER BY g.name',
        clientId,
        clientId,
      )
      .map(parse);
  });

  app.post('/api/geofences', async (req) => {
    const u = requireUser(req);
    const body = schema.parse(req.body);
    const clientId = u.role === 'client' ? u.clientId! : body.clientId;
    if (!clientId) throw new HttpError(400, 'Informe o cliente');
    const db = getDb();
    if (body.vehicleId) {
      const v = db.get<{ client_id: number }>('SELECT client_id FROM vehicles WHERE id = ?', body.vehicleId);
      if (!v || v.client_id !== clientId) throw new HttpError(400, 'Veículo não pertence ao cliente');
    }
    const now = Date.now();
    const r = db.run(
      'INSERT INTO geofences (client_id, vehicle_id, name, type, geometry, color, alert_on_enter, alert_on_exit, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      clientId,
      body.vehicleId ?? null,
      body.name,
      body.geometry.type,
      JSON.stringify(body.geometry),
      body.color ?? '#2563eb',
      body.alertOnEnter === false ? 0 : 1,
      body.alertOnExit === false ? 0 : 1,
      body.active === false ? 0 : 1,
      now,
      now,
    );
    audit(req, 'create', 'geofence', r.lastId);
    return parse(db.get('SELECT * FROM geofences WHERE id = ?', r.lastId)!);
  });

  app.put('/api/geofences/:id', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    const scope = scopeClientId(req);
    const body = schema.partial().parse(req.body);
    const db = getDb();
    const ex = db.get<Record<string, any>>('SELECT * FROM geofences WHERE id = ?', id);
    if (!ex) throw new HttpError(404, 'Cerca não encontrada');
    if (scope !== null && ex.client_id !== scope) throw new HttpError(403, 'Sem acesso');
    db.run(
      'UPDATE geofences SET vehicle_id = ?, name = ?, type = ?, geometry = ?, color = ?, alert_on_enter = ?, alert_on_exit = ?, active = ?, updated_at = ? WHERE id = ?',
      body.vehicleId === undefined ? ex.vehicle_id : body.vehicleId,
      body.name ?? ex.name,
      body.geometry?.type ?? ex.type,
      body.geometry ? JSON.stringify(body.geometry) : ex.geometry,
      body.color ?? ex.color,
      body.alertOnEnter === undefined ? ex.alert_on_enter : body.alertOnEnter ? 1 : 0,
      body.alertOnExit === undefined ? ex.alert_on_exit : body.alertOnExit ? 1 : 0,
      body.active === undefined ? ex.active : body.active ? 1 : 0,
      Date.now(),
      id,
    );
    audit(req, 'update', 'geofence', id);
    return parse(db.get('SELECT * FROM geofences WHERE id = ?', id)!);
  });

  app.delete('/api/geofences/:id', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    const scope = scopeClientId(req);
    const db = getDb();
    const ex = db.get<{ client_id: number }>('SELECT client_id FROM geofences WHERE id = ?', id);
    if (!ex) throw new HttpError(404, 'Cerca não encontrada');
    if (scope !== null && ex.client_id !== scope) throw new HttpError(403, 'Sem acesso');
    db.run('DELETE FROM geofences WHERE id = ?', id);
    audit(req, 'delete', 'geofence', id);
    return { ok: true };
  });
}
