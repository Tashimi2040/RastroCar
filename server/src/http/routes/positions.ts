import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/index.js';
import { HttpError, requireUser, scopeClientId, assertVehicleAccess, intParam, parseRange } from '../context.js';
import { simplifyRoute } from '../../services/geo.js';
import { reverseGeocode, getCachedAddress } from '../../services/geocode.js';
import { VEHICLE_LIST_SQL, decorateVehicle } from './vehicles.js';

export async function positionRoutes(app: FastifyInstance) {
  /** Últimas posições de todos os veículos do escopo (mapa ao vivo). */
  app.get('/api/positions/latest', async (req) => {
    const scope = scopeClientId(req);
    const rows = getDb().all<Record<string, unknown>>(`${VEHICLE_LIST_SQL} WHERE (? IS NULL OR v.client_id = ?) AND v.active = 1 ORDER BY v.name`, scope, scope);
    return rows.map(decorateVehicle);
  });

  /** Histórico de posições (rota) de um veículo em um período. */
  app.get('/api/positions', async (req) => {
    const q = req.query as { vehicleId?: string; deviceId?: string; from?: string; to?: string; simplify?: string; limit?: string };
    const db = getDb();
    let deviceId: number;
    if (q.vehicleId) {
      const vid = intParam(q.vehicleId, 'vehicleId');
      assertVehicleAccess(req, vid);
      const dev = db.get<{ id: number }>('SELECT id FROM devices WHERE vehicle_id = ?', vid);
      if (!dev) return [];
      deviceId = dev.id;
    } else if (q.deviceId) {
      deviceId = intParam(q.deviceId, 'deviceId');
      if (scopeClientId(req) !== null) throw new HttpError(403, 'Informe vehicleId');
    } else throw new HttpError(400, 'Informe vehicleId');
    const { from, to } = parseRange(q);
    const limit = Math.min(50000, Number(q.limit) || 20000);
    const rows = db.all<{ id: number; fix_time: number; lat: number; lng: number; speed: number; course: number | null; ignition: number | null; satellites: number | null; alarm: string | null }>(
      'SELECT id, fix_time, lat, lng, speed, course, ignition, satellites, alarm, battery_level, power_voltage, gsm_signal, odometer_m FROM positions WHERE device_id = ? AND valid = 1 AND fix_time BETWEEN ? AND ? ORDER BY fix_time ASC LIMIT ?',
      deviceId,
      from,
      to,
      limit,
    );
    const tol = Number(q.simplify);
    if (tol > 0 && rows.length > 500) return simplifyRoute(rows, tol);
    return rows;
  });

  app.get('/api/positions/:id', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    const scope = scopeClientId(req);
    const row = getDb().get<Record<string, unknown> & { client_id: number | null }>(
      'SELECT p.*, v.client_id FROM positions p LEFT JOIN vehicles v ON v.id = p.vehicle_id WHERE p.id = ?',
      id,
    );
    if (!row) throw new HttpError(404, 'Posição não encontrada');
    if (scope !== null && row.client_id !== scope) throw new HttpError(403, 'Sem acesso');
    return row;
  });

  app.get('/api/geocode/reverse', async (req) => {
    requireUser(req);
    const q = req.query as { lat?: string; lng?: string };
    const lat = Number(q.lat);
    const lng = Number(q.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'Coordenadas inválidas');
    const cached = getCachedAddress(lat, lng);
    if (cached) return { address: cached, cached: true };
    const address = await reverseGeocode(lat, lng);
    return { address, cached: false };
  });
}
