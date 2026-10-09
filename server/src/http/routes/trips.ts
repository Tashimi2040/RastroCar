import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/index.js';
import { HttpError, scopeClientId, assertVehicleAccess, intParam, parseRange } from '../context.js';
import { simplifyRoute } from '../../services/geo.js';

export async function tripRoutes(app: FastifyInstance) {
  app.get('/api/trips', async (req) => {
    const q = req.query as { vehicleId?: string; from?: string; to?: string };
    const scope = scopeClientId(req);
    const vehicleId = q.vehicleId ? intParam(q.vehicleId, 'vehicleId') : null;
    if (vehicleId) assertVehicleAccess(req, vehicleId);
    const { from, to } = parseRange(q, 24 * 7);
    return getDb().all(
      `SELECT t.*, v.name AS vehicle_name, v.plate AS vehicle_plate
       FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id
       WHERE (? IS NULL OR t.client_id = ?) AND (? IS NULL OR t.vehicle_id = ?) AND t.start_time BETWEEN ? AND ?
       ORDER BY t.start_time DESC LIMIT 1000`,
      scope,
      scope,
      vehicleId,
      vehicleId,
      from,
      to,
    );
  });

  app.get('/api/trips/summary', async (req) => {
    const q = req.query as { vehicleId?: string; from?: string; to?: string };
    const scope = scopeClientId(req);
    const vehicleId = q.vehicleId ? intParam(q.vehicleId, 'vehicleId') : null;
    if (vehicleId) assertVehicleAccess(req, vehicleId);
    const { from, to } = parseRange(q, 24 * 30);
    const days = getDb().all(
      `SELECT date(start_time / 1000, 'unixepoch', 'localtime') AS day, t.vehicle_id, v.name AS vehicle_name, v.plate AS vehicle_plate,
        COUNT(*) AS trips, SUM(distance_m) AS distance_m, SUM(duration_s) AS duration_s, MAX(max_speed) AS max_speed,
        MIN(start_time) AS first_start, MAX(end_time) AS last_end
       FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id
       WHERE t.status = 'closed' AND (? IS NULL OR t.client_id = ?) AND (? IS NULL OR t.vehicle_id = ?) AND t.start_time BETWEEN ? AND ?
       GROUP BY day, t.vehicle_id ORDER BY day DESC, vehicle_name`,
      scope,
      scope,
      vehicleId,
      vehicleId,
      from,
      to,
    );
    const totals = getDb().get(
      `SELECT COUNT(*) AS trips, COALESCE(SUM(distance_m),0) AS distance_m, COALESCE(SUM(duration_s),0) AS duration_s, COALESCE(MAX(max_speed),0) AS max_speed
       FROM trips t WHERE t.status = 'closed' AND (? IS NULL OR t.client_id = ?) AND (? IS NULL OR t.vehicle_id = ?) AND t.start_time BETWEEN ? AND ?`,
      scope,
      scope,
      vehicleId,
      vehicleId,
      from,
      to,
    );
    return { days, totals };
  });

  app.get('/api/trips/:id', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    const scope = scopeClientId(req);
    const db = getDb();
    const trip = db.get<Record<string, any>>('SELECT t.*, v.name AS vehicle_name, v.plate AS vehicle_plate FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ?', id);
    if (!trip) throw new HttpError(404, 'Viagem não encontrada');
    if (scope !== null && trip.client_id !== scope) throw new HttpError(403, 'Sem acesso');
    const end = trip.end_time ?? Date.now();
    const points = db.all<{ id: number; fix_time: number; lat: number; lng: number; speed: number; course: number | null }>(
      'SELECT id, fix_time, lat, lng, speed, course, ignition FROM positions WHERE device_id = ? AND valid = 1 AND fix_time BETWEEN ? AND ? ORDER BY fix_time ASC LIMIT 50000',
      trip.device_id,
      trip.start_time,
      end,
    );
    const simplify = Number((req.query as { simplify?: string }).simplify);
    const events = db.all('SELECT id, type, severity, title, message, lat, lng, event_time FROM events WHERE device_id = ? AND event_time BETWEEN ? AND ? ORDER BY event_time', trip.device_id, trip.start_time, end);
    return { ...trip, points: simplify > 0 && points.length > 500 ? simplifyRoute(points, simplify) : points, events };
  });

  app.get('/api/stops', async (req) => {
    const q = req.query as { vehicleId?: string; from?: string; to?: string };
    const scope = scopeClientId(req);
    const vehicleId = q.vehicleId ? intParam(q.vehicleId, 'vehicleId') : null;
    if (vehicleId) assertVehicleAccess(req, vehicleId);
    const { from, to } = parseRange(q, 24 * 7);
    return getDb().all(
      `SELECT s.*, v.name AS vehicle_name, v.plate AS vehicle_plate,
        CASE WHEN s.end_time IS NULL THEN CAST((? - s.start_time) / 1000 AS INTEGER) ELSE s.duration_s END AS duration_s
       FROM stops s LEFT JOIN vehicles v ON v.id = s.vehicle_id
       WHERE (? IS NULL OR s.client_id = ?) AND (? IS NULL OR s.vehicle_id = ?) AND s.start_time BETWEEN ? AND ?
       ORDER BY s.start_time DESC LIMIT 1000`,
      Date.now(),
      scope,
      scope,
      vehicleId,
      vehicleId,
      from,
      to,
    );
  });
}
