import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { HttpError, requireStaff, scopeClientId, assertVehicleAccess, intParam, audit } from '../context.js';
import { isDeviceOnline, getDeviceRuntimeInfo, refreshDeviceRuntime } from '../../services/tracking.js';
import { registry } from '../../gateway/registry.js';

const vehicleSchema = z.object({
  clientId: z.number().int().positive(),
  name: z.string().min(1),
  plate: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  color: z.string().optional().nullable(),
  type: z.enum(['car', 'motorcycle', 'truck', 'van', 'bus', 'other']).optional(),
  speedLimit: z.number().int().min(0).max(300).optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  deviceId: z.number().int().positive().optional().nullable(),
});

export const VEHICLE_LIST_SQL = `
  SELECT v.*, c.name AS client_name,
    d.id AS device_id, d.imei, d.protocol, d.status AS device_status, d.last_seen_at, d.sim_phone, d.model AS device_model,
    p.id AS position_id, p.fix_time, p.lat, p.lng, p.speed, p.course, p.ignition, p.battery_level, p.power_voltage, p.gsm_signal, p.satellites, p.valid, p.odometer_m, p.alarm,
    (SELECT COALESCE(SUM(distance_m),0) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'closed') AS total_distance_m
  FROM vehicles v
  JOIN clients c ON c.id = v.client_id
  LEFT JOIN devices d ON d.vehicle_id = v.id
  LEFT JOIN positions p ON p.id = d.last_position_id
`;

export function decorateVehicle(row: Record<string, unknown>) {
  const deviceId = row.device_id as number | null;
  const rt = deviceId ? getDeviceRuntimeInfo(deviceId) : null;
  const online = deviceId ? isDeviceOnline(deviceId, row.last_seen_at as number | null) : false;
  const speed = (row.speed as number | null) ?? 0;
  const ignition = rt?.ignition ?? (row.ignition == null ? null : row.ignition === 1);
  let state: 'offline' | 'moving' | 'stopped' | 'idle' | 'no_device' = 'no_device';
  if (deviceId) {
    if (!online) state = 'offline';
    else if (speed >= 5) state = 'moving';
    else if (ignition) state = 'idle';
    else state = 'stopped';
  }
  return { ...row, online, ignition, blocked: rt?.blocked ?? null, trip_open: rt?.tripOpen ?? false, state, connected: row.imei ? registry.isOnline(row.imei as string) : false };
}

export async function vehicleRoutes(app: FastifyInstance) {
  app.get('/api/vehicles', async (req) => {
    const scope = scopeClientId(req);
    const q = req.query as { clientId?: string; includeInactive?: string };
    const clientId = scope ?? (q.clientId ? intParam(q.clientId, 'clientId') : null);
    const rows = getDb().all<Record<string, unknown>>(
      `${VEHICLE_LIST_SQL} WHERE (? IS NULL OR v.client_id = ?) AND (? = 1 OR v.active = 1) ORDER BY v.name`,
      clientId,
      clientId,
      q.includeInactive === '1' ? 1 : 0,
    );
    return rows.map(decorateVehicle);
  });

  app.get('/api/vehicles/:id', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    assertVehicleAccess(req, id);
    const row = getDb().get<Record<string, unknown>>(`${VEHICLE_LIST_SQL} WHERE v.id = ?`, id);
    if (!row) throw new HttpError(404, 'Veículo não encontrado');
    return decorateVehicle(row);
  });

  app.post('/api/vehicles', async (req) => {
    requireStaff(req);
    const body = vehicleSchema.parse(req.body);
    const db = getDb();
    if (!db.get('SELECT id FROM clients WHERE id = ?', body.clientId)) throw new HttpError(400, 'Cliente inexistente');
    const now = Date.now();
    const r = db.run(
      `INSERT INTO vehicles (client_id, name, plate, brand, model, year, color, type, speed_limit, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.clientId,
      body.name,
      body.plate?.toUpperCase() ?? null,
      body.brand ?? null,
      body.model ?? null,
      body.year ?? null,
      body.color ?? null,
      body.type ?? 'car',
      body.speedLimit ?? null,
      body.notes ?? null,
      body.active === false ? 0 : 1,
      now,
      now,
    );
    if (body.deviceId) linkDevice(body.deviceId, r.lastId);
    audit(req, 'create', 'vehicle', r.lastId, body);
    return decorateVehicle(db.get(`${VEHICLE_LIST_SQL} WHERE v.id = ?`, r.lastId)!);
  });

  app.put('/api/vehicles/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const body = vehicleSchema.partial().parse(req.body);
    const db = getDb();
    const ex = db.get<Record<string, any>>('SELECT * FROM vehicles WHERE id = ?', id);
    if (!ex) throw new HttpError(404, 'Veículo não encontrado');
    const pick = <T,>(k: keyof typeof body, col: string): T => (body[k] === undefined ? ex[col] : (body[k] as T));
    db.run(
      `UPDATE vehicles SET client_id = ?, name = ?, plate = ?, brand = ?, model = ?, year = ?, color = ?, type = ?, speed_limit = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?`,
      pick<number>('clientId', 'client_id'),
      pick<string>('name', 'name'),
      (pick<string | null>('plate', 'plate') ?? null)?.toUpperCase() ?? null,
      pick<string | null>('brand', 'brand'),
      pick<string | null>('model', 'model'),
      pick<number | null>('year', 'year'),
      pick<string | null>('color', 'color'),
      pick<string>('type', 'type'),
      pick<number | null>('speedLimit', 'speed_limit'),
      pick<string | null>('notes', 'notes'),
      body.active === undefined ? ex.active : body.active ? 1 : 0,
      Date.now(),
      id,
    );
    if (body.deviceId !== undefined) {
      // desvincula qualquer rastreador atual e vincula o novo (se houver)
      const current = db.all<{ id: number }>('SELECT id FROM devices WHERE vehicle_id = ?', id);
      for (const d of current) if (d.id !== body.deviceId) unlinkDevice(d.id);
      if (body.deviceId) linkDevice(body.deviceId, id);
    }
    // Atualiza runtime do rastreador vinculado (cliente pode ter mudado)
    for (const d of db.all<{ id: number }>('SELECT id FROM devices WHERE vehicle_id = ?', id)) refreshDeviceRuntime(d.id);
    audit(req, 'update', 'vehicle', id, body);
    return decorateVehicle(db.get(`${VEHICLE_LIST_SQL} WHERE v.id = ?`, id)!);
  });

  app.delete('/api/vehicles/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const db = getDb();
    const devices = db.all<{ id: number }>('SELECT id FROM devices WHERE vehicle_id = ?', id);
    const r = db.run('DELETE FROM vehicles WHERE id = ?', id);
    if (!r.changes) throw new HttpError(404, 'Veículo não encontrado');
    for (const d of devices) refreshDeviceRuntime(d.id);
    audit(req, 'delete', 'vehicle', id);
    return { ok: true };
  });
}

export function linkDevice(deviceId: number, vehicleId: number) {
  const db = getDb();
  const dev = db.get<{ id: number }>('SELECT id FROM devices WHERE id = ?', deviceId);
  if (!dev) throw new HttpError(400, 'Rastreador inexistente');
  db.run("UPDATE devices SET vehicle_id = ?, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?", vehicleId, Date.now(), deviceId);
  db.run('UPDATE positions SET vehicle_id = ? WHERE device_id = ? AND vehicle_id IS NULL', vehicleId, deviceId);
  refreshDeviceRuntime(deviceId);
}

export function unlinkDevice(deviceId: number) {
  getDb().run('UPDATE devices SET vehicle_id = NULL, updated_at = ? WHERE id = ?', Date.now(), deviceId);
  refreshDeviceRuntime(deviceId);
}
