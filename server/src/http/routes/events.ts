import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/index.js';
import { HttpError, requireUser, scopeClientId, assertVehicleAccess, intParam, parseRange } from '../context.js';

export async function eventRoutes(app: FastifyInstance) {
  app.get('/api/events', async (req) => {
    const q = req.query as { vehicleId?: string; from?: string; to?: string; type?: string; severity?: string; unacknowledged?: string; limit?: string };
    const scope = scopeClientId(req);
    const vehicleId = q.vehicleId ? intParam(q.vehicleId, 'vehicleId') : null;
    if (vehicleId) assertVehicleAccess(req, vehicleId);
    const { from, to } = parseRange(q, 24 * 7);
    const limit = Math.min(2000, Number(q.limit) || 500);
    return getDb().all(
      `SELECT e.*, v.name AS vehicle_name, v.plate AS vehicle_plate, d.imei, c.name AS client_name
       FROM events e
       LEFT JOIN vehicles v ON v.id = e.vehicle_id
       LEFT JOIN devices d ON d.id = e.device_id
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE (? IS NULL OR e.client_id = ?) AND (? IS NULL OR e.vehicle_id = ?) AND (? IS NULL OR e.type = ?) AND (? IS NULL OR e.severity = ?)
         AND (? = 0 OR e.acknowledged = 0) AND e.event_time BETWEEN ? AND ?
       ORDER BY e.event_time DESC LIMIT ?`,
      scope,
      scope,
      vehicleId,
      vehicleId,
      q.type ?? null,
      q.type ?? null,
      q.severity ?? null,
      q.severity ?? null,
      q.unacknowledged === '1' ? 1 : 0,
      from,
      to,
      limit,
    );
  });

  app.get('/api/events/unread', async (req) => {
    const scope = scopeClientId(req);
    const row = getDb().get<{ count: number; critical: number }>(
      `SELECT COUNT(*) AS count, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical
       FROM events WHERE acknowledged = 0 AND severity != 'info' AND (? IS NULL OR client_id = ?)`,
      scope,
      scope,
    );
    return { count: row?.count ?? 0, critical: row?.critical ?? 0 };
  });

  app.post('/api/events/:id/ack', async (req) => {
    const u = requireUser(req);
    const id = intParam((req.params as { id: string }).id);
    const scope = scopeClientId(req);
    const db = getDb();
    const ev = db.get<{ client_id: number | null }>('SELECT client_id FROM events WHERE id = ?', id);
    if (!ev) throw new HttpError(404, 'Evento não encontrado');
    if (scope !== null && ev.client_id !== scope) throw new HttpError(403, 'Sem acesso');
    db.run('UPDATE events SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?', u.sub, Date.now(), id);
    return { ok: true };
  });

  app.post('/api/events/ack-all', async (req) => {
    const u = requireUser(req);
    const scope = scopeClientId(req);
    const r = getDb().run('UPDATE events SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE acknowledged = 0 AND (? IS NULL OR client_id = ?)', u.sub, Date.now(), scope, scope);
    return { ok: true, count: r.changes };
  });
}
