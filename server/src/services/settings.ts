import { getDb } from '../db/index.js';
import { config } from '../config.js';

export interface AppSettings {
  company_name: string;
  public_host: string;
  tcp_port: number;
  map_tile_url: string;
  map_attribution: string;
  map_center_lat: number;
  map_center_lng: number;
  map_zoom: number;
  default_speed_limit: number;
  /** Minutos parado (ignição desligada ou sem movimento) para encerrar uma viagem. */
  trip_idle_timeout_min: number;
  /** Distância mínima (m) para uma viagem ser registrada. */
  trip_min_distance_m: number;
  /** Minutos sem comunicação para o veículo ser considerado offline. */
  offline_timeout_min: number;
  /** Ativa geocodificação reversa (Nominatim/OpenStreetMap). */
  reverse_geocode: boolean;
  /** Dias de retenção de posições brutas (0 = para sempre). */
  positions_retention_days: number;
  timezone: string;
  /** Senha padrão dos rastreadores (usada em comandos de bloqueio). */
  device_default_password: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  company_name: 'RastroCar',
  public_host: config.publicHost,
  tcp_port: config.tcpPort,
  map_tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  map_attribution: '&copy; OpenStreetMap contributors',
  map_center_lat: -23.55052,
  map_center_lng: -46.633308,
  map_zoom: 11,
  default_speed_limit: 110,
  trip_idle_timeout_min: 5,
  trip_min_distance_m: 200,
  offline_timeout_min: 15,
  reverse_geocode: true,
  positions_retention_days: 365,
  timezone: config.timezone,
  device_default_password: '123456',
};

let cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cache) return cache;
  const db = getDb();
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      merged[r.key] = JSON.parse(r.value);
    } catch {
      merged[r.key] = r.value;
    }
  }
  cache = merged as unknown as AppSettings;
  return cache;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
      db.run(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        key,
        JSON.stringify(value),
        now,
      );
    }
  });
  cache = null;
  return getSettings();
}
