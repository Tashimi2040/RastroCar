import { getDb } from '../db/index.js';
import { hub } from '../ws/hub.js';
import type { AlarmType } from '../gateway/types.js';

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface NewEvent {
  deviceId: number;
  vehicleId?: number | null;
  clientId?: number | null;
  type: string;
  severity?: EventSeverity;
  title: string;
  message?: string | null;
  positionId?: number | null;
  lat?: number | null;
  lng?: number | null;
  geofenceId?: number | null;
  data?: Record<string, unknown>;
  eventTime?: number;
}

export const ALARM_INFO: Record<AlarmType, { title: string; severity: EventSeverity }> = {
  sos: { title: 'Botão de pânico (SOS)', severity: 'critical' },
  powerCut: { title: 'Alimentação cortada', severity: 'critical' },
  powerRestored: { title: 'Alimentação restaurada', severity: 'info' },
  vibration: { title: 'Vibração / choque detectado', severity: 'warning' },
  lowBattery: { title: 'Bateria interna baixa', severity: 'warning' },
  lowPower: { title: 'Tensão externa baixa', severity: 'warning' },
  overspeed: { title: 'Excesso de velocidade (rastreador)', severity: 'warning' },
  geofenceEnter: { title: 'Entrou em cerca (rastreador)', severity: 'info' },
  geofenceExit: { title: 'Saiu da cerca (rastreador)', severity: 'warning' },
  movement: { title: 'Movimento detectado', severity: 'warning' },
  tamper: { title: 'Violação do equipamento', severity: 'critical' },
  door: { title: 'Porta aberta', severity: 'warning' },
  powerOn: { title: 'Rastreador ligado', severity: 'info' },
  powerOff: { title: 'Rastreador desligado', severity: 'warning' },
  gpsAntennaCut: { title: 'Antena GPS desconectada', severity: 'critical' },
  accOn: { title: 'Ignição ligada', severity: 'info' },
  accOff: { title: 'Ignição desligada', severity: 'info' },
  jamming: { title: 'Bloqueador de sinal (jammer) detectado', severity: 'critical' },
  accident: { title: 'Possível colisão', severity: 'critical' },
  general: { title: 'Alarme do rastreador', severity: 'warning' },
};

const cooldowns = new Map<string, number>();

/** Evita repetir o mesmo evento em sequência (ex.: excesso de velocidade contínuo). */
export function underCooldown(key: string, ms: number): boolean {
  const now = Date.now();
  const last = cooldowns.get(key) ?? 0;
  if (now - last < ms) return true;
  cooldowns.set(key, now);
  return false;
}

export function createEvent(ev: NewEvent) {
  const db = getDb();
  const now = Date.now();
  const r = db.run(
    `INSERT INTO events (device_id, vehicle_id, client_id, type, severity, title, message, position_id, lat, lng, geofence_id, data, event_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ev.deviceId,
    ev.vehicleId ?? null,
    ev.clientId ?? null,
    ev.type,
    ev.severity ?? 'info',
    ev.title,
    ev.message ?? null,
    ev.positionId ?? null,
    ev.lat ?? null,
    ev.lng ?? null,
    ev.geofenceId ?? null,
    ev.data ? JSON.stringify(ev.data) : null,
    ev.eventTime ?? now,
    now,
  );
  const row = db.get('SELECT e.*, v.name AS vehicle_name, v.plate AS vehicle_plate FROM events e LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE e.id = ?', r.lastId);
  hub.broadcast(ev.clientId ?? null, { type: 'event', data: row });
  return row;
}
