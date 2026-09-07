import { getDb } from '../db/index.js';
import { haversine } from './geo.js';
import { getSettings } from './settings.js';
import { reverseGeocode } from './geocode.js';
import { hub } from '../ws/hub.js';

export interface TripPoint {
  id: number;
  fixTime: number;
  lat: number;
  lng: number;
  speed: number;
  ignition?: boolean | null;
}

export interface OpenTrip {
  id: number;
  startTime: number;
  distance: number;
  maxSpeed: number;
  speedSum: number;
  points: number;
}

export interface OpenStop {
  id: number;
  startTime: number;
  lat: number;
  lng: number;
}

export interface TripState {
  deviceId: number;
  vehicleId: number | null;
  clientId: number | null;
  lastPos?: TripPoint;
  lastMovingPos?: TripPoint;
  lastMovingTime: number;
  trip?: OpenTrip;
  stop?: OpenStop;
}

const MOVING_SPEED_KMH = 5;
const MOVING_DISTANCE_M = 50;
const MAX_PLAUSIBLE_SPEED_KMH = 250;
const MAX_PLAUSIBLE_JUMP_M = 20000;

export function loadTripState(deviceId: number, vehicleId: number | null, clientId: number | null): TripState {
  const db = getDb();
  const state: TripState = { deviceId, vehicleId, clientId, lastMovingTime: 0 };
  const trip = db.get<{ id: number; start_time: number; distance_m: number; max_speed: number; avg_speed: number; points: number; end_time: number | null }>(
    "SELECT * FROM trips WHERE device_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
    deviceId,
  );
  if (trip) {
    state.trip = {
      id: trip.id,
      startTime: trip.start_time,
      distance: trip.distance_m,
      maxSpeed: trip.max_speed,
      speedSum: trip.avg_speed * trip.points,
      points: trip.points,
    };
  }
  const stop = db.get<{ id: number; start_time: number; lat: number; lng: number }>(
    'SELECT * FROM stops WHERE device_id = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1',
    deviceId,
  );
  if (stop) state.stop = { id: stop.id, startTime: stop.start_time, lat: stop.lat, lng: stop.lng };
  const last = db.get<{ id: number; fix_time: number; lat: number; lng: number; speed: number; ignition: number | null }>(
    'SELECT id, fix_time, lat, lng, speed, ignition FROM positions WHERE device_id = ? AND valid = 1 ORDER BY fix_time DESC LIMIT 1',
    deviceId,
  );
  if (last) {
    state.lastPos = { id: last.id, fixTime: last.fix_time, lat: last.lat, lng: last.lng, speed: last.speed, ignition: last.ignition == null ? null : last.ignition === 1 };
    state.lastMovingPos = state.lastPos;
    state.lastMovingTime = last.fix_time;
  }
  return state;
}

/** Verifica se o deslocamento entre dois pontos é fisicamente plausível (filtra saltos de GPS). */
export function isPlausibleMove(a: TripPoint, b: TripPoint): { ok: boolean; distance: number } {
  const distance = haversine(a, b);
  const dtH = Math.max(1, b.fixTime - a.fixTime) / 3600000;
  if (distance > MAX_PLAUSIBLE_JUMP_M) return { ok: false, distance };
  if (distance / 1000 / dtH > MAX_PLAUSIBLE_SPEED_KMH && distance > 100) return { ok: false, distance };
  return { ok: true, distance };
}

export interface TripUpdate {
  tripStarted?: number;
  tripEnded?: number;
  tripDiscarded?: boolean;
}

/**
 * Máquina de estados de viagem. Deve ser chamada para cada posição válida,
 * em ordem cronológica, por dispositivo.
 */
export function processTripPoint(state: TripState, p: TripPoint): TripUpdate {
  const settings = getSettings();
  const idleTimeoutMs = settings.trip_idle_timeout_min * 60000;
  const update: TripUpdate = {};
  const last = state.lastPos;

  // Lacuna longa sem dados: encerra viagem aberta no último ponto conhecido.
  if (state.trip && last && p.fixTime - Math.max(state.lastMovingTime, last.fixTime) > idleTimeoutMs) {
    closeTrip(state, state.lastMovingPos ?? last, state.lastMovingTime || last.fixTime, update);
  }

  let distance = 0;
  let plausible = true;
  if (last) {
    const r = isPlausibleMove(last, p);
    plausible = r.ok;
    distance = r.distance;
  }

  const dtMs = last ? Math.max(1, p.fixTime - last.fixTime) : 0;
  const impliedKmh = last ? (distance / 1000) / (dtMs / 3600000) : 0;
  const movingNow =
    plausible && (p.speed >= MOVING_SPEED_KMH || (distance >= MOVING_DISTANCE_M && dtMs <= 10 * 60000 && impliedKmh >= 3));
  const ignitionOn = p.ignition === true;
  const ignitionOff = p.ignition === false;
  const ignitionTurnedOn = ignitionOn && last?.ignition !== true;

  if (!state.trip) {
    if (movingNow || ignitionTurnedOn) {
      // Começa no último ponto parado para incluir o local de partida
      const startPoint = last && plausible && distance < MAX_PLAUSIBLE_JUMP_M ? last : p;
      openTrip(state, startPoint, update);
      if (movingNow && plausible) {
        state.trip!.distance += distance;
      }
    }
  } else {
    const t = state.trip;
    if (plausible) t.distance += distance;
    t.points += 1;
    t.speedSum += p.speed;
    if (p.speed > t.maxSpeed) t.maxSpeed = p.speed;
  }

  if (movingNow) {
    state.lastMovingTime = p.fixTime;
    state.lastMovingPos = p;
  }

  if (state.trip) {
    const idleMs = p.fixTime - (state.lastMovingTime || state.trip.startTime);
    const shouldClose = ignitionOff ? idleMs >= 20000 || !movingNow && last?.ignition === false : idleMs >= idleTimeoutMs;
    if (shouldClose) {
      const endPoint = ignitionOff ? p : state.lastMovingPos ?? p;
      const endTime = ignitionOff ? p.fixTime : state.lastMovingTime || p.fixTime;
      closeTrip(state, endPoint, endTime, update);
    } else {
      persistTripProgress(state.trip);
    }
  } else if (!state.stop) {
    openStop(state, p);
  }

  state.lastPos = p;
  return update;
}

function openTrip(state: TripState, start: TripPoint, update: TripUpdate) {
  const db = getDb();
  const now = Date.now();
  if (state.stop) closeStop(state, start.fixTime);
  const r = db.run(
    `INSERT INTO trips (device_id, vehicle_id, client_id, status, start_time, start_position_id, start_lat, start_lng, created_at)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    state.deviceId,
    state.vehicleId,
    state.clientId,
    start.fixTime,
    start.id,
    start.lat,
    start.lng,
    now,
  );
  state.trip = { id: r.lastId, startTime: start.fixTime, distance: 0, maxSpeed: 0, speedSum: 0, points: 0 };
  update.tripStarted = r.lastId;
  const tripId = r.lastId;
  void reverseGeocode(start.lat, start.lng).then((addr) => {
    if (addr) db.run('UPDATE trips SET start_address = ? WHERE id = ?', addr, tripId);
  });
  hub.broadcast(state.clientId, { type: 'trip', data: { id: tripId, deviceId: state.deviceId, vehicleId: state.vehicleId, status: 'open', startTime: start.fixTime } });
}

function persistTripProgress(t: OpenTrip) {
  getDb().run(
    'UPDATE trips SET distance_m = ?, max_speed = ?, avg_speed = ?, points = ? WHERE id = ?',
    Math.round(t.distance),
    t.maxSpeed,
    t.points ? t.speedSum / t.points : 0,
    t.points,
    t.id,
  );
}

function closeTrip(state: TripState, end: TripPoint, endTime: number, update: TripUpdate) {
  const t = state.trip;
  if (!t) return;
  const db = getDb();
  const settings = getSettings();
  const duration = Math.max(0, Math.round((endTime - t.startTime) / 1000));
  state.trip = undefined;
  if (t.distance < settings.trip_min_distance_m || duration < 30) {
    db.run('DELETE FROM trips WHERE id = ?', t.id);
    update.tripDiscarded = true;
    // Mantém a parada anterior (se houver) aberta — ela continua válida.
    if (!state.stop) openStop(state, end, t.startTime);
    return;
  }
  const avg = duration > 0 ? (t.distance / 1000) / (duration / 3600) : 0;
  db.run(
    `UPDATE trips SET status = 'closed', end_time = ?, end_position_id = ?, end_lat = ?, end_lng = ?, distance_m = ?, duration_s = ?, max_speed = ?, avg_speed = ?, points = ?
     WHERE id = ?`,
    endTime,
    end.id,
    end.lat,
    end.lng,
    Math.round(t.distance),
    duration,
    t.maxSpeed,
    Math.round(avg * 10) / 10,
    t.points,
    t.id,
  );
  update.tripEnded = t.id;
  const tripId = t.id;
  void reverseGeocode(end.lat, end.lng).then((addr) => {
    if (addr) db.run('UPDATE trips SET end_address = ? WHERE id = ?', addr, tripId);
  });
  hub.broadcast(state.clientId, {
    type: 'trip',
    data: { id: tripId, deviceId: state.deviceId, vehicleId: state.vehicleId, status: 'closed', startTime: t.startTime, endTime, distance: Math.round(t.distance), duration },
  });
  openStop(state, end, endTime);
}

function openStop(state: TripState, p: TripPoint, startTime = p.fixTime) {
  const db = getDb();
  const r = db.run(
    'INSERT INTO stops (device_id, vehicle_id, client_id, start_time, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
    state.deviceId,
    state.vehicleId,
    state.clientId,
    startTime,
    p.lat,
    p.lng,
  );
  state.stop = { id: r.lastId, startTime, lat: p.lat, lng: p.lng };
  const stopId = r.lastId;
  void reverseGeocode(p.lat, p.lng).then((addr) => {
    if (addr) db.run('UPDATE stops SET address = ? WHERE id = ?', addr, stopId);
  });
}

function closeStop(state: TripState, endTime: number) {
  const s = state.stop;
  if (!s) return;
  const duration = Math.max(0, Math.round((endTime - s.startTime) / 1000));
  getDb().run('UPDATE stops SET end_time = ?, duration_s = ? WHERE id = ?', endTime, duration, s.id);
  state.stop = undefined;
}

/** Atualiza vínculo veículo/cliente do estado (quando o admin associa o rastreador a outro veículo). */
export function rebindTripState(state: TripState, vehicleId: number | null, clientId: number | null) {
  state.vehicleId = vehicleId;
  state.clientId = clientId;
}
