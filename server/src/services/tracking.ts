import { getDb } from '../db/index.js';
import { config } from '../config.js';
import type { DecodedPosition, DecodedStatus } from '../gateway/types.js';
import { isValidCoordinate, pointInGeofence, type GeofenceGeometry } from './geo.js';
import { getSettings } from './settings.js';
import { ALARM_INFO, createEvent, underCooldown } from './events.js';
import { loadTripState, processTripPoint, rebindTripState, isPlausibleMove, type TripState } from './trips.js';
import { hub } from '../ws/hub.js';
import { logger } from '../logger.js';

export interface DeviceRow {
  id: number;
  imei: string;
  name: string | null;
  protocol: string | null;
  vehicle_id: number | null;
  status: 'pending' | 'active' | 'disabled';
  last_seen_at: number | null;
  last_position_id: number | null;
}

interface VehicleRow {
  id: number;
  client_id: number;
  name: string;
  plate: string | null;
  speed_limit: number | null;
}

interface DeviceRuntime {
  device: DeviceRow;
  vehicle: VehicleRow | null;
  trip: TripState;
  online: boolean;
  ignition?: boolean;
  blocked?: boolean;
  geofenceInside: Set<number> | null;
  lastFixTime: number;
}

const runtimes = new Map<number, DeviceRuntime>();

function loadVehicle(vehicleId: number | null): VehicleRow | null {
  if (!vehicleId) return null;
  return getDb().get<VehicleRow>('SELECT id, client_id, name, plate, speed_limit FROM vehicles WHERE id = ?', vehicleId) ?? null;
}

function getRuntime(device: DeviceRow): DeviceRuntime {
  let rt = runtimes.get(device.id);
  if (!rt) {
    const vehicle = loadVehicle(device.vehicle_id);
    rt = {
      device,
      vehicle,
      trip: loadTripState(device.id, vehicle?.id ?? null, vehicle?.client_id ?? null),
      online: false,
      geofenceInside: null,
      lastFixTime: 0,
    };
    const last = device.last_position_id
      ? getDb().get<{ fix_time: number; ignition: number | null }>('SELECT fix_time, ignition FROM positions WHERE id = ?', device.last_position_id)
      : undefined;
    if (last) {
      rt.lastFixTime = last.fix_time;
      if (last.ignition != null) rt.ignition = last.ignition === 1;
    }
    runtimes.set(device.id, rt);
  }
  return rt;
}

/** Deve ser chamado quando o admin altera vínculo de rastreador/veículo. */
export function refreshDeviceRuntime(deviceId: number) {
  const rt = runtimes.get(deviceId);
  if (!rt) return;
  const device = getDb().get<DeviceRow>('SELECT * FROM devices WHERE id = ?', deviceId);
  if (!device) {
    runtimes.delete(deviceId);
    return;
  }
  rt.device = device;
  rt.vehicle = loadVehicle(device.vehicle_id);
  rebindTripState(rt.trip, rt.vehicle?.id ?? null, rt.vehicle?.client_id ?? null);
  rt.geofenceInside = null;
}

export function findOrCreateDevice(imei: string, protocol: string, ip?: string): DeviceRow | null {
  const db = getDb();
  let device = db.get<DeviceRow>('SELECT * FROM devices WHERE imei = ?', imei);
  if (!device) {
    if (!config.autoRegisterDevices) return null;
    const now = Date.now();
    db.run(
      `INSERT INTO devices (imei, name, protocol, status, last_seen_at, last_ip, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      imei,
      `Rastreador ${imei.slice(-6)}`,
      protocol,
      now,
      ip ?? null,
      now,
      now,
    );
    device = db.get<DeviceRow>('SELECT * FROM devices WHERE imei = ?', imei)!;
    logger.info({ imei, protocol }, 'novo rastreador registrado automaticamente (pendente)');
    hub.broadcast(null, { type: 'device', data: { id: device.id, imei, protocol, status: 'pending', online: true, new: true } });
  }
  return device;
}

function markSeen(rt: DeviceRuntime, protocol: string, ip?: string, time = Date.now()) {
  const db = getDb();
  db.run('UPDATE devices SET last_seen_at = ?, protocol = ?, last_ip = COALESCE(?, last_ip), updated_at = ? WHERE id = ?', time, protocol, ip ?? null, time, rt.device.id);
  rt.device.last_seen_at = time;
  rt.device.protocol = protocol;
  if (!rt.online) {
    rt.online = true;
    if (rt.device.last_position_id) {
      createEvent({
        deviceId: rt.device.id,
        vehicleId: rt.vehicle?.id,
        clientId: rt.vehicle?.client_id,
        type: 'online',
        severity: 'info',
        title: 'Rastreador online',
        message: `${rt.vehicle?.name ?? rt.device.name ?? rt.device.imei} voltou a comunicar`,
      });
    }
    hub.broadcast(rt.vehicle?.client_id ?? null, { type: 'device', data: { id: rt.device.id, imei: rt.device.imei, vehicleId: rt.vehicle?.id ?? null, online: true } });
  }
}

export function ingestStatus(status: DecodedStatus, ip?: string) {
  const device = findOrCreateDevice(status.imei, status.protocol, ip);
  if (!device || device.status === 'disabled') return;
  const rt = getRuntime(device);
  markSeen(rt, status.protocol, ip, status.time);
  handleIgnition(rt, status.ignition, status.time, null, null, null);
  handleBlocked(rt, status.blocked, status.time);
  if (status.alarm) emitAlarm(rt, status.alarm, status.time, null, null, null);
  const data: Record<string, unknown> = {
    id: device.id,
    imei: device.imei,
    vehicleId: rt.vehicle?.id ?? null,
    online: true,
    status: {
      ignition: rt.ignition,
      batteryLevel: status.batteryLevel,
      powerVoltage: status.powerVoltage,
      gsmSignal: status.gsmSignal,
      charging: status.charging,
      blocked: rt.blocked,
      time: status.time,
    },
  };
  if (status.batteryLevel != null || status.powerVoltage != null || status.gsmSignal != null) {
    // Persiste no último registro de posição para exibição (sem criar uma posição nova)
    const db = getDb();
    if (device.last_position_id) {
      db.run(
        'UPDATE positions SET battery_level = COALESCE(?, battery_level), power_voltage = COALESCE(?, power_voltage), gsm_signal = COALESCE(?, gsm_signal), ignition = COALESCE(?, ignition) WHERE id = ?',
        status.batteryLevel ?? null,
        status.powerVoltage ?? null,
        status.gsmSignal ?? null,
        status.ignition == null ? null : status.ignition ? 1 : 0,
        device.last_position_id,
      );
    }
  }
  hub.broadcast(rt.vehicle?.client_id ?? null, { type: 'device', data });
}

export function ingestPosition(pos: DecodedPosition, ip?: string): number | null {
  const device = findOrCreateDevice(pos.imei, pos.protocol, ip);
  if (!device || device.status === 'disabled') return null;
  const rt = getRuntime(device);
  const db = getDb();
  const now = Date.now();

  let fixTime = pos.fixTime;
  if (!Number.isFinite(fixTime) || fixTime > now + 3600000 || fixTime < Date.UTC(2015, 0, 1)) fixTime = now;

  markSeen(rt, pos.protocol, ip, now);

  const coordsOk = isValidCoordinate(pos.lat, pos.lng);
  let valid = pos.valid && coordsOk;
  // Filtro de saltos de GPS: posição fisicamente impossível em relação à última válida é guardada como inválida
  if (valid && rt.trip.lastPos && fixTime > rt.trip.lastPos.fixTime) {
    const check = isPlausibleMove(rt.trip.lastPos, { id: 0, fixTime, lat: pos.lat, lng: pos.lng, speed: pos.speed });
    if (!check.ok) {
      valid = false;
      pos.attributes = { ...(pos.attributes ?? {}), filtered: 'jump', jumpM: Math.round(check.distance) };
      logger.debug({ imei: pos.imei, jumpM: Math.round(check.distance) }, 'posição descartada por salto implausível');
    }
  }

  // Eventos de status vêm mesmo sem fix
  handleIgnition(rt, pos.ignition, fixTime, null, valid ? pos.lat : null, valid ? pos.lng : null);
  handleBlocked(rt, pos.blocked, fixTime);

  if (!coordsOk) {
    if (pos.alarm) emitAlarm(rt, pos.alarm, fixTime, null, null, null);
    return null;
  }

  // Descarta retransmissões (mesmo horário) e posições fora de ordem muito antigas
  if (valid && fixTime <= rt.lastFixTime) {
    const dup = db.get<{ id: number }>('SELECT id FROM positions WHERE device_id = ? AND fix_time = ? LIMIT 1', device.id, fixTime);
    if (dup) return dup.id;
  }

  const r = db.run(
    `INSERT INTO positions (device_id, vehicle_id, protocol, fix_time, server_time, valid, lat, lng, altitude, speed, course, satellites, ignition, battery_level, power_voltage, gsm_signal, odometer_m, alarm, attributes, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    device.id,
    rt.vehicle?.id ?? null,
    pos.protocol,
    fixTime,
    now,
    valid ? 1 : 0,
    pos.lat,
    pos.lng,
    pos.altitude ?? null,
    Math.round(pos.speed * 10) / 10,
    pos.course ?? null,
    pos.satellites ?? null,
    pos.ignition == null ? (rt.ignition == null ? null : rt.ignition ? 1 : 0) : pos.ignition ? 1 : 0,
    pos.batteryLevel ?? null,
    pos.powerVoltage ?? null,
    pos.gsmSignal ?? null,
    pos.odometerM ?? null,
    pos.alarm ?? null,
    pos.attributes ? JSON.stringify(pos.attributes) : null,
    pos.raw ?? null,
  );
  const positionId = r.lastId;

  if (valid && fixTime >= rt.lastFixTime) {
    db.run('UPDATE devices SET last_position_id = ? WHERE id = ?', positionId, device.id);
    rt.device.last_position_id = positionId;
    rt.lastFixTime = fixTime;

    // Viagens / rotas
    try {
      processTripPoint(rt.trip, { id: positionId, fixTime, lat: pos.lat, lng: pos.lng, speed: pos.speed, ignition: pos.ignition ?? rt.ignition ?? null });
    } catch (err) {
      logger.error({ err, imei: pos.imei }, 'erro ao processar viagem');
    }

    // Excesso de velocidade
    const limit = rt.vehicle?.speed_limit ?? getSettings().default_speed_limit;
    if (limit > 0 && pos.speed > limit && !underCooldown(`overspeed:${device.id}`, 5 * 60000)) {
      createEvent({
        deviceId: device.id,
        vehicleId: rt.vehicle?.id,
        clientId: rt.vehicle?.client_id,
        type: 'overspeed',
        severity: 'warning',
        title: 'Excesso de velocidade',
        message: `${rt.vehicle?.name ?? device.imei} a ${Math.round(pos.speed)} km/h (limite ${limit} km/h)`,
        positionId,
        lat: pos.lat,
        lng: pos.lng,
        data: { speed: pos.speed, limit },
        eventTime: fixTime,
      });
    }

    // Cercas virtuais
    if (rt.vehicle) evaluateGeofences(rt, pos.lat, pos.lng, positionId, fixTime);
  }

  if (pos.alarm) emitAlarm(rt, pos.alarm, fixTime, positionId, pos.lat, pos.lng);

  const row = db.get('SELECT * FROM positions WHERE id = ?', positionId);
  hub.broadcast(rt.vehicle?.client_id ?? null, {
    type: 'position',
    data: { ...row, imei: device.imei, vehicle_id: rt.vehicle?.id ?? null, online: true, blocked: rt.blocked ?? null, trip_open: !!rt.trip.trip },
  });
  return positionId;
}

function handleIgnition(rt: DeviceRuntime, ignition: boolean | undefined, time: number, positionId: number | null, lat: number | null, lng: number | null) {
  if (ignition === undefined || ignition === rt.ignition) return;
  const previous = rt.ignition;
  rt.ignition = ignition;
  if (previous === undefined) return; // primeiro valor conhecido, sem evento
  createEvent({
    deviceId: rt.device.id,
    vehicleId: rt.vehicle?.id,
    clientId: rt.vehicle?.client_id,
    type: ignition ? 'ignitionOn' : 'ignitionOff',
    severity: 'info',
    title: ignition ? 'Ignição ligada' : 'Ignição desligada',
    message: lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null,
    positionId,
    lat,
    lng,
    eventTime: time,
  });
}

function handleBlocked(rt: DeviceRuntime, blocked: boolean | undefined, time: number) {
  if (blocked === undefined || blocked === rt.blocked) return;
  const previous = rt.blocked;
  rt.blocked = blocked;
  if (previous === undefined) return;
  createEvent({
    deviceId: rt.device.id,
    vehicleId: rt.vehicle?.id,
    clientId: rt.vehicle?.client_id,
    type: blocked ? 'engineBlocked' : 'engineUnblocked',
    severity: blocked ? 'warning' : 'info',
    title: blocked ? 'Motor bloqueado' : 'Motor desbloqueado',
    message: null,
    eventTime: time,
  });
}

function emitAlarm(rt: DeviceRuntime, alarm: DecodedPosition['alarm'], time: number, positionId: number | null, lat: number | null, lng: number | null) {
  if (!alarm) return;
  if (alarm === 'accOn' || alarm === 'accOff') {
    handleIgnition(rt, alarm === 'accOn', time, positionId, lat, lng);
    return;
  }
  const info = ALARM_INFO[alarm];
  const cooldownMs = info.severity === 'critical' ? 60000 : 5 * 60000;
  if (underCooldown(`alarm:${rt.device.id}:${alarm}`, cooldownMs)) return;
  createEvent({
    deviceId: rt.device.id,
    vehicleId: rt.vehicle?.id,
    clientId: rt.vehicle?.client_id,
    type: alarm,
    severity: info.severity,
    title: info.title,
    message: lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null,
    positionId,
    lat,
    lng,
    eventTime: time,
  });
}

interface GeofenceRow {
  id: number;
  name: string;
  type: 'circle' | 'polygon';
  geometry: string;
  vehicle_id: number | null;
  alert_on_enter: number;
  alert_on_exit: number;
}

function evaluateGeofences(rt: DeviceRuntime, lat: number, lng: number, positionId: number, time: number) {
  const vehicle = rt.vehicle!;
  const fences = getDb().all<GeofenceRow>(
    'SELECT id, name, type, geometry, vehicle_id, alert_on_enter, alert_on_exit FROM geofences WHERE client_id = ? AND active = 1 AND (vehicle_id IS NULL OR vehicle_id = ?)',
    vehicle.client_id,
    vehicle.id,
  );
  const inside = new Set<number>();
  for (const f of fences) {
    let geometry: GeofenceGeometry;
    try {
      geometry = JSON.parse(f.geometry) as GeofenceGeometry;
    } catch {
      continue;
    }
    if (pointInGeofence({ lat, lng }, geometry)) inside.add(f.id);
  }
  const previous = rt.geofenceInside;
  rt.geofenceInside = inside;
  if (!previous) return; // primeira avaliação: apenas registra estado
  for (const f of fences) {
    const was = previous.has(f.id);
    const is = inside.has(f.id);
    if (was === is) continue;
    if (is && !f.alert_on_enter) continue;
    if (!is && !f.alert_on_exit) continue;
    createEvent({
      deviceId: rt.device.id,
      vehicleId: vehicle.id,
      clientId: vehicle.client_id,
      type: is ? 'geofenceEnter' : 'geofenceExit',
      severity: is ? 'info' : 'warning',
      title: is ? `Entrou na cerca "${f.name}"` : `Saiu da cerca "${f.name}"`,
      message: vehicle.name,
      positionId,
      lat,
      lng,
      geofenceId: f.id,
      eventTime: time,
    });
  }
}

/** Marca dispositivos sem comunicação como offline (executado periodicamente). */
export function checkOfflineDevices() {
  const timeoutMs = getSettings().offline_timeout_min * 60000;
  const now = Date.now();
  for (const rt of runtimes.values()) {
    if (!rt.online) continue;
    const lastSeen = rt.device.last_seen_at ?? 0;
    if (now - lastSeen < timeoutMs) continue;
    rt.online = false;
    createEvent({
      deviceId: rt.device.id,
      vehicleId: rt.vehicle?.id,
      clientId: rt.vehicle?.client_id,
      type: 'offline',
      severity: 'warning',
      title: 'Rastreador sem comunicação',
      message: `${rt.vehicle?.name ?? rt.device.name ?? rt.device.imei} está há ${Math.round((now - lastSeen) / 60000)} min sem enviar dados`,
    });
    hub.broadcast(rt.vehicle?.client_id ?? null, { type: 'device', data: { id: rt.device.id, imei: rt.device.imei, vehicleId: rt.vehicle?.id ?? null, online: false } });
  }
}

export function isDeviceOnline(deviceId: number, lastSeenAt: number | null): boolean {
  const rt = runtimes.get(deviceId);
  if (rt) return rt.online;
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt < getSettings().offline_timeout_min * 60000;
}

export function getDeviceRuntimeInfo(deviceId: number) {
  const rt = runtimes.get(deviceId);
  if (!rt) return null;
  return { online: rt.online, ignition: rt.ignition, blocked: rt.blocked, tripOpen: !!rt.trip.trip };
}

/** Remove posições antigas conforme retenção configurada. */
export function purgeOldPositions() {
  const days = getSettings().positions_retention_days;
  if (!days || days <= 0) return 0;
  const cutoff = Date.now() - days * 86400000;
  const r = getDb().run('DELETE FROM positions WHERE fix_time < ? AND id NOT IN (SELECT last_position_id FROM devices WHERE last_position_id IS NOT NULL)', cutoff);
  return r.changes;
}

/** Carrega o estado de todos os dispositivos ativos na inicialização. */
export function warmUpRuntimes() {
  const devices = getDb().all<DeviceRow>("SELECT * FROM devices WHERE status != 'disabled'");
  const timeoutMs = getSettings().offline_timeout_min * 60000;
  for (const d of devices) {
    const rt = getRuntime(d);
    rt.online = !!d.last_seen_at && Date.now() - d.last_seen_at < timeoutMs;
  }
  logger.info({ count: devices.length }, 'estado dos rastreadores carregado');
}
