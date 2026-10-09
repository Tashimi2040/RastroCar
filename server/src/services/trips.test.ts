import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rastrocar-test-'));
process.env.DB_PATH = path.join(process.env.DATA_DIR, 'test.db');

const { getDb } = await import('../db/index.js');
const { loadTripState, processTripPoint } = await import('./trips.js');
const { updateSettings } = await import('./settings.js');

let deviceId = 0;
before(() => {
  const db = getDb();
  const now = Date.now();
  db.run("INSERT INTO devices (imei, status, created_at, updated_at) VALUES ('111111111111111', 'active', ?, ?)", now, now);
  deviceId = db.get<{ id: number }>('SELECT id FROM devices')!.id;
  updateSettings({ reverse_geocode: false, trip_idle_timeout_min: 5, trip_min_distance_m: 200 });
});

test('detecta viagem por movimento e encerra por ignição desligada', () => {
  const state = loadTripState(deviceId, null, null);
  const t0 = Date.UTC(2026, 8, 7, 12, 0, 0);
  let id = 1;
  // Parado 2 min
  for (let i = 0; i < 4; i++) processTripPoint(state, { id: id++, fixTime: t0 + i * 30000, lat: -23.55, lng: -46.63, speed: 0, ignition: false });
  assert.equal(state.trip, undefined);
  assert.ok(state.stop, 'deveria haver parada aberta');
  // Anda 3 km para o norte em 5 min (aprox. 0.027 graus)
  let started: number | undefined;
  for (let i = 1; i <= 10; i++) {
    const u = processTripPoint(state, { id: id++, fixTime: t0 + 120000 + i * 30000, lat: -23.55 + i * 0.0027, lng: -46.63, speed: 40, ignition: true });
    if (u.tripStarted) started = u.tripStarted;
  }
  assert.ok(started, 'viagem deveria ter iniciado');
  assert.ok(state.trip, 'viagem deveria estar aberta');
  assert.ok(state.trip!.distance > 2500 && state.trip!.distance < 3500, `distância ${state.trip!.distance}`);
  // Para e desliga ignição
  const tEnd = t0 + 120000 + 11 * 30000;
  processTripPoint(state, { id: id++, fixTime: tEnd, lat: -23.523, lng: -46.63, speed: 0, ignition: true });
  const u = processTripPoint(state, { id: id++, fixTime: tEnd + 30000, lat: -23.523, lng: -46.63, speed: 0, ignition: false });
  assert.ok(u.tripEnded, 'viagem deveria ter encerrado');
  const trip = getDb().get<any>('SELECT * FROM trips WHERE id = ?', u.tripEnded);
  assert.equal(trip.status, 'closed');
  assert.ok(trip.distance_m > 2500);
  assert.equal(trip.max_speed, 40);
  assert.ok(trip.duration_s > 0);
  assert.ok(state.stop, 'nova parada deveria estar aberta');
  const stops = getDb().all<any>('SELECT * FROM stops ORDER BY id');
  assert.equal(stops.length, 2);
  assert.ok(stops[0].end_time, 'primeira parada deveria estar fechada');
});

test('descarta viagens curtas (ruído de GPS)', () => {
  const state = loadTripState(deviceId, null, null);
  const t0 = Date.UTC(2026, 8, 7, 14, 0, 0);
  const before = getDb().get<{ n: number }>('SELECT COUNT(*) AS n FROM trips')!.n;
  processTripPoint(state, { id: 100, fixTime: t0, lat: -23.6, lng: -46.7, speed: 0, ignition: null });
  processTripPoint(state, { id: 101, fixTime: t0 + 20000, lat: -23.6006, lng: -46.7, speed: 8, ignition: null }); // ~66 m
  assert.ok(state.trip, 'viagem provisória aberta');
  processTripPoint(state, { id: 102, fixTime: t0 + 40000, lat: -23.6006, lng: -46.7, speed: 0, ignition: null });
  const u = processTripPoint(state, { id: 103, fixTime: t0 + 6 * 60000, lat: -23.6006, lng: -46.7, speed: 0, ignition: null });
  assert.equal(u.tripDiscarded, true);
  const after = getDb().get<{ n: number }>('SELECT COUNT(*) AS n FROM trips')!.n;
  assert.equal(after, before);
});
