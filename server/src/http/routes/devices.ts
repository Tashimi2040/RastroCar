import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { HttpError, requireStaff, intParam, audit, scopeClientId } from '../context.js';
import { isDeviceOnline, getDeviceRuntimeInfo, refreshDeviceRuntime } from '../../services/tracking.js';
import { registry } from '../../gateway/registry.js';
import { gatewayStats } from '../../gateway/tcp.js';
import { linkDevice, unlinkDevice } from './vehicles.js';
import { buildSetupInstructions, DEVICE_MODELS } from '../../services/setup.js';
import { getSettings } from '../../services/settings.js';

const deviceSchema = z.object({
  imei: z.string().regex(/^\d{10,17}$/, 'IMEI deve ter entre 10 e 17 dígitos'),
  name: z.string().optional().nullable(),
  protocol: z.enum(['gt06', 'h02', 'tk103']).optional().nullable(),
  model: z.string().optional().nullable(),
  simPhone: z.string().optional().nullable(),
  simCarrier: z.string().optional().nullable(),
  vehicleId: z.number().int().positive().optional().nullable(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  notes: z.string().optional().nullable(),
});

const LIST_SQL = `
  SELECT d.*, v.name AS vehicle_name, v.plate AS vehicle_plate, v.client_id, c.name AS client_name,
    p.fix_time, p.lat, p.lng, p.speed, p.ignition, p.battery_level, p.power_voltage, p.gsm_signal, p.satellites,
    (SELECT COUNT(*) FROM positions px WHERE px.device_id = d.id) AS positions_count
  FROM devices d
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  LEFT JOIN clients c ON c.id = v.client_id
  LEFT JOIN positions p ON p.id = d.last_position_id
`;

function decorate(row: Record<string, unknown>) {
  const id = row.id as number;
  const rt = getDeviceRuntimeInfo(id);
  return {
    ...row,
    online: isDeviceOnline(id, row.last_seen_at as number | null),
    connected: registry.isOnline(row.imei as string),
    ignition: rt?.ignition ?? (row.ignition == null ? null : row.ignition === 1),
    blocked: rt?.blocked ?? null,
  };
}

export async function deviceRoutes(app: FastifyInstance) {
  app.get('/api/devices', async (req) => {
    const scope = scopeClientId(req);
    const q = req.query as { status?: string; unassigned?: string };
    const rows = getDb().all<Record<string, unknown>>(
      `${LIST_SQL} WHERE (? IS NULL OR v.client_id = ?) AND (? IS NULL OR d.status = ?) AND (? = 0 OR d.vehicle_id IS NULL) ORDER BY d.status = 'pending' DESC, d.last_seen_at DESC`,
      scope,
      scope,
      q.status ?? null,
      q.status ?? null,
      q.unassigned === '1' ? 1 : 0,
    );
    return rows.map(decorate);
  });

  app.get('/api/devices/models', async () => DEVICE_MODELS);

  app.get('/api/devices/gateway', async (req) => {
    requireStaff(req);
    return gatewayStats();
  });

  app.get('/api/devices/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const row = getDb().get<Record<string, unknown>>(`${LIST_SQL} WHERE d.id = ?`, id);
    if (!row) throw new HttpError(404, 'Rastreador não encontrado');
    return decorate(row);
  });

  app.get('/api/devices/:id/setup', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const dev = getDb().get<{ imei: string; model: string | null; protocol: string | null; sim_carrier: string | null; sim_phone: string | null }>('SELECT * FROM devices WHERE id = ?', id);
    if (!dev) throw new HttpError(404, 'Rastreador não encontrado');
    const q = req.query as { model?: string; carrier?: string };
    return buildSetupInstructions({
      model: q.model ?? dev.model ?? undefined,
      carrier: q.carrier ?? dev.sim_carrier ?? undefined,
      imei: dev.imei,
      settings: getSettings(),
    });
  });

  app.post('/api/devices', async (req) => {
    requireStaff(req);
    const body = deviceSchema.parse(req.body);
    const db = getDb();
    if (db.get('SELECT id FROM devices WHERE imei = ?', body.imei)) throw new HttpError(409, 'IMEI já cadastrado');
    const now = Date.now();
    const r = db.run(
      `INSERT INTO devices (imei, name, protocol, model, sim_phone, sim_carrier, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.imei,
      body.name ?? `Rastreador ${body.imei.slice(-6)}`,
      body.protocol ?? null,
      body.model ?? null,
      body.simPhone ?? null,
      body.simCarrier ?? null,
      body.status ?? (body.vehicleId ? 'active' : 'pending'),
      body.notes ?? null,
      now,
      now,
    );
    if (body.vehicleId) linkDevice(r.lastId, body.vehicleId);
    audit(req, 'create', 'device', r.lastId, { imei: body.imei });
    return decorate(db.get(`${LIST_SQL} WHERE d.id = ?`, r.lastId)!);
  });

  app.put('/api/devices/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const body = deviceSchema.partial().parse(req.body);
    const db = getDb();
    const ex = db.get<Record<string, any>>('SELECT * FROM devices WHERE id = ?', id);
    if (!ex) throw new HttpError(404, 'Rastreador não encontrado');
    if (body.imei && body.imei !== ex.imei && db.get('SELECT id FROM devices WHERE imei = ?', body.imei)) throw new HttpError(409, 'IMEI já cadastrado');
    db.run(
      'UPDATE devices SET imei = ?, name = ?, protocol = ?, model = ?, sim_phone = ?, sim_carrier = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
      body.imei ?? ex.imei,
      body.name === undefined ? ex.name : body.name,
      body.protocol === undefined ? ex.protocol : body.protocol,
      body.model === undefined ? ex.model : body.model,
      body.simPhone === undefined ? ex.sim_phone : body.simPhone,
      body.simCarrier === undefined ? ex.sim_carrier : body.simCarrier,
      body.status ?? ex.status,
      body.notes === undefined ? ex.notes : body.notes,
      Date.now(),
      id,
    );
    if (body.vehicleId !== undefined) {
      if (body.vehicleId) {
        const other = db.all<{ id: number }>('SELECT id FROM devices WHERE vehicle_id = ? AND id != ?', body.vehicleId, id);
        for (const o of other) unlinkDevice(o.id);
        linkDevice(id, body.vehicleId);
      } else unlinkDevice(id);
    }
    refreshDeviceRuntime(id);
    audit(req, 'update', 'device', id, body);
    return decorate(db.get(`${LIST_SQL} WHERE d.id = ?`, id)!);
  });

  app.delete('/api/devices/:id', async (req) => {
    requireStaff(req);
    const id = intParam((req.params as { id: string }).id);
    const db = getDb();
    const dev = db.get<{ imei: string }>('SELECT imei FROM devices WHERE id = ?', id);
    if (!dev) throw new HttpError(404, 'Rastreador não encontrado');
    registry.get(dev.imei)?.socket.destroy();
    db.run('DELETE FROM devices WHERE id = ?', id);
    refreshDeviceRuntime(id);
    audit(req, 'delete', 'device', id, { imei: dev.imei });
    return { ok: true };
  });
}
