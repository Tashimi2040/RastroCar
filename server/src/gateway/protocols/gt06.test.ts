import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gt06, buildGt06Frame } from './gt06.js';
import { crc16itu } from './crc.js';
import type { Session } from '../types.js';

function session(): Session {
  return { id: 1, socket: {} as any, remoteAddress: '127.0.0.1', buffer: Buffer.alloc(0), serial: 0, connectedAt: 0, lastActivity: 0, state: {} };
}

test('crc16itu bate com exemplo oficial do protocolo', () => {
  // Exemplo do manual GT06: 78 78 0D 01 01 23 45 67 89 01 23 45 00 01 8C DD 0D 0A
  const body = Buffer.from('0d010123456789012345 0001'.replace(/ /g, ''), 'hex');
  assert.equal(crc16itu(body).toString(16), '8cdd');
});

test('login GT06 identifica IMEI e responde ACK', () => {
  const frame = Buffer.from('78780d010123456789012345000 18cdd0d0a'.replace(/ /g, ''), 'hex');
  const s = session();
  assert.equal(gt06.frameLength(frame), frame.length);
  const r = gt06.decode(frame, s);
  assert.equal(r.login, '123456789012345');
  assert.equal(r.responses.length, 1);
  assert.equal(r.responses[0].toString('hex'), '787805010001d9dc0d0a');
});

test('posição GT06 0x12 decodifica coordenadas do hemisfério sul', () => {
  // Monta um frame de posição para São Paulo (-23.5505, -46.6333)
  const lat = Math.round(23.5505 * 1800000);
  const lng = Math.round(46.6333 * 1800000);
  const content = Buffer.alloc(6 + 12 + 8);
  content.set([26, 9, 7, 15, 30, 0], 0); // 2026-09-07 15:30:00 UTC
  content[6] = 0xca; // gps len 12, 10 satélites
  content.writeUInt32BE(lat, 7);
  content.writeUInt32BE(lng, 11);
  content[15] = 60; // km/h
  // bit12 fix ok, bit10 = 0 (sul), bit11 = 1 (oeste), curso 90
  content.writeUInt16BE(0x1000 | 0x0800 | 90, 16);
  content.writeUInt16BE(724, 18); // mcc
  content[20] = 5;
  content.writeUInt16BE(1234, 21);
  content.writeUIntBE(5678, 23, 3);
  const frame = buildGt06Frame(0x12, content, 7);
  const s = session();
  s.imei = '123456789012345';
  const r = gt06.decode(frame, s);
  assert.equal(r.positions.length, 1);
  const p = r.positions[0];
  assert.ok(Math.abs(p.lat + 23.5505) < 0.0001);
  assert.ok(Math.abs(p.lng + 46.6333) < 0.0001);
  assert.equal(p.speed, 60);
  assert.equal(p.course, 90);
  assert.equal(p.satellites, 10);
  assert.equal(p.valid, true);
  assert.equal(p.fixTime, Date.UTC(2026, 8, 7, 15, 30, 0));
});

test('heartbeat GT06 0x13 extrai ignição e bateria e responde', () => {
  const content = Buffer.from([0b01000010, 5, 3, 0x00, 0x02]);
  const frame = buildGt06Frame(0x13, content, 3);
  const s = session();
  s.imei = '123456789012345';
  const r = gt06.decode(frame, s);
  assert.equal(r.statuses.length, 1);
  assert.equal(r.statuses[0].ignition, true);
  assert.equal(r.statuses[0].batteryLevel, 80);
  assert.equal(r.responses[0][3], 0x13);
});

test('alarme GT06 0x16 identifica SOS', () => {
  const content = Buffer.alloc(6 + 12 + 9 + 5);
  content.set([26, 9, 7, 15, 30, 0], 0);
  content[6] = 0xc5;
  content.writeUInt32BE(1000000, 7);
  content.writeUInt32BE(2000000, 11);
  content.writeUInt16BE(0x1000 | 0x0400, 16);
  content[18] = 8; // lbs length
  content[27] = 0b00100010; // terminal info: SOS bits(100) e ACC on
  content[28] = 4;
  content[29] = 4;
  content[30] = 0x01; // alarm sos
  content[31] = 0x02;
  const frame = buildGt06Frame(0x16, content, 9);
  const s = session();
  s.imei = '123456789012345';
  const r = gt06.decode(frame, s);
  assert.equal(r.positions[0].alarm, 'sos');
  assert.equal(r.positions[0].ignition, true);
  assert.equal(r.responses.length, 1);
});

test('encodeCommand gera frame 0x80 com RELAY,1#', () => {
  const s = session();
  s.imei = '123456789012345';
  const frame = gt06.encodeCommand({ id: 1, type: 'engineStop', password: '123456' }, s)!;
  assert.equal(frame[3], 0x80);
  assert.ok(frame.toString('latin1').includes('RELAY,1#'));
  assert.equal(gt06.frameLength(frame), frame.length);
});

test('frameLength lida com frames parciais e lixo', () => {
  assert.equal(gt06.frameLength(Buffer.from('7878', 'hex')), 0);
  assert.equal(gt06.frameLength(Buffer.from('78780d0101', 'hex')), 0);
  assert.equal(gt06.frameLength(Buffer.from('0000000000', 'hex')), -1);
});
