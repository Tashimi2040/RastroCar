import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireUser, requireStaff, audit } from '../context.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../../services/settings.js';
import { buildSetupInstructions, DEVICE_MODELS, CARRIERS } from '../../services/setup.js';
import { config } from '../../config.js';
import { getDb } from '../../db/index.js';
import { gatewayStats } from '../../gateway/tcp.js';
import { hub } from '../../ws/hub.js';

const schema = z.object({
  company_name: z.string().min(1).optional(),
  public_host: z.string().optional(),
  tcp_port: z.number().int().min(1).max(65535).optional(),
  map_tile_url: z.string().url().optional(),
  map_attribution: z.string().optional(),
  map_center_lat: z.number().min(-90).max(90).optional(),
  map_center_lng: z.number().min(-180).max(180).optional(),
  map_zoom: z.number().int().min(1).max(19).optional(),
  default_speed_limit: z.number().int().min(0).max(300).optional(),
  trip_idle_timeout_min: z.number().int().min(1).max(120).optional(),
  trip_min_distance_m: z.number().int().min(0).max(10000).optional(),
  offline_timeout_min: z.number().int().min(1).max(1440).optional(),
  reverse_geocode: z.boolean().optional(),
  positions_retention_days: z.number().int().min(0).max(3650).optional(),
  timezone: z.string().optional(),
  device_default_password: z.string().max(20).optional(),
});

const PUBLIC_KEYS = ['company_name', 'map_tile_url', 'map_attribution', 'map_center_lat', 'map_center_lng', 'map_zoom', 'default_speed_limit', 'timezone'] as const;

export async function settingsRoutes(app: FastifyInstance) {
  /** Configurações públicas (sem autenticação) para a tela de login. */
  app.get('/api/settings/public', async () => {
    const s = getSettings();
    return { company_name: s.company_name, map_tile_url: s.map_tile_url, map_attribution: s.map_attribution, map_center_lat: s.map_center_lat, map_center_lng: s.map_center_lng, map_zoom: s.map_zoom };
  });

  app.get('/api/settings', async (req) => {
    const u = requireUser(req);
    const s = getSettings();
    if (u.role === 'admin') return { ...s, defaults: DEFAULT_SETTINGS, env: { tcpPort: config.tcpPort, httpPort: config.httpPort, autoRegisterDevices: config.autoRegisterDevices, dbPath: config.dbPath } };
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC_KEYS) out[k] = s[k];
    if (u.role === 'operator') Object.assign(out, { public_host: s.public_host, tcp_port: s.tcp_port, device_default_password: s.device_default_password });
    return out;
  });

  app.put('/api/settings', async (req) => {
    requireAdmin(req);
    const body = schema.parse(req.body);
    const s = updateSettings(body);
    audit(req, 'update', 'settings', undefined, body);
    return s;
  });

  app.get('/api/setup/instructions', async (req) => {
    requireStaff(req);
    const q = req.query as { model?: string; carrier?: string; imei?: string };
    return buildSetupInstructions({ model: q.model, carrier: q.carrier, imei: q.imei, settings: getSettings() });
  });

  app.get('/api/setup/options', async (req) => {
    requireStaff(req);
    return { models: DEVICE_MODELS, carriers: Object.entries(CARRIERS).map(([id, c]) => ({ id, ...c })) };
  });

  app.get('/api/dashboard', async (req) => {
    const u = requireUser(req);
    const scope = u.role === 'client' ? u.clientId : null;
    const db = getDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const vehicles = db.get<{ total: number }>('SELECT COUNT(*) AS total FROM vehicles WHERE active = 1 AND (? IS NULL OR client_id = ?)', scope, scope)!.total;
    const devices = db.get<{ total: number; pending: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) AS pending FROM devices d LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE (? IS NULL OR v.client_id = ?)`,
      scope,
      scope,
    )!;
    const offlineCutoff = Date.now() - getSettings().offline_timeout_min * 60000;
    const online = db.get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM devices d LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE d.last_seen_at > ? AND (? IS NULL OR v.client_id = ?)',
      offlineCutoff,
      scope,
      scope,
    )!.total;
    const moving = db.get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM devices d JOIN positions p ON p.id = d.last_position_id LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE d.last_seen_at > ? AND p.speed >= 5 AND (? IS NULL OR v.client_id = ?)',
      offlineCutoff,
      scope,
      scope,
    )!.total;
    const today = db.get<{ trips: number; distance_m: number; duration_s: number }>(
      `SELECT COUNT(*) AS trips, COALESCE(SUM(distance_m),0) AS distance_m, COALESCE(SUM(duration_s),0) AS duration_s FROM trips WHERE start_time >= ? AND (? IS NULL OR client_id = ?)`,
      startOfDay.getTime(),
      scope,
      scope,
    )!;
    const alerts = db.get<{ total: number; critical: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical FROM events WHERE acknowledged = 0 AND severity != 'info' AND (? IS NULL OR client_id = ?)`,
      scope,
      scope,
    )!;
    const clients = scope ? null : db.get<{ total: number }>('SELECT COUNT(*) AS total FROM clients WHERE active = 1')!.total;
    const positionsToday = db.get<{ total: number }>('SELECT COUNT(*) AS total FROM positions WHERE server_time >= ? AND (? IS NULL OR vehicle_id IN (SELECT id FROM vehicles WHERE client_id = ?))', startOfDay.getTime(), scope, scope)!.total;
    return {
      vehicles,
      devices: devices.total,
      devicesPending: devices.pending ?? 0,
      online,
      offline: Math.max(0, devices.total - online),
      moving,
      clients,
      today: { trips: today.trips, distanceM: today.distance_m, durationS: today.duration_s, positions: positionsToday },
      alerts: { total: alerts.total, critical: alerts.critical ?? 0 },
      gateway: scope ? undefined : { ...gatewayStats(), wsClients: hub.connectedCount },
    };
  });

  app.get('/api/audit', async (req) => {
    requireAdmin(req);
    return getDb().all('SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300');
  });
}
