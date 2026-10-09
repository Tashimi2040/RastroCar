import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h02 } from './h02.js';
import { tk103 } from './tk103.js';
import type { Session } from '../types.js';

function session(): Session {
  return { id: 1, socket: {} as any, remoteAddress: '127.0.0.1', buffer: Buffer.alloc(0), serial: 0, connectedAt: 0, lastActivity: 0, state: {} };
}

test('H02 decodifica posição V1', () => {
  const msg = Buffer.from('*HQ,353588123456789,V1,153000,A,2333.0300,S,04637.9980,W,010.80,090,070926,FFFFFBFF,724,05,1234,5678#');
  assert.ok(h02.detect(msg));
  assert.equal(h02.frameLength(msg), msg.length);
  const r = h02.decode(msg, session());
  assert.equal(r.login, '353588123456789');
  const p = r.positions[0];
  assert.ok(Math.abs(p.lat + 23.5505) < 0.001);
  assert.ok(Math.abs(p.lng + 46.6333) < 0.001);
  assert.equal(p.speed, 20); // 10.8 nós
  assert.equal(p.fixTime, Date.UTC(2026, 8, 7, 15, 30, 0));
  assert.equal(p.ignition, false); // FFFFFBFF: bit 10 em zero = ignição desligada
  assert.equal(r.responses.length, 1);
});

test('TK103 login, heartbeat e posição', () => {
  const s = session();
  const login = Buffer.from('##,imei:359586015829802,A;');
  assert.ok(tk103.detect(login));
  let r = tk103.decode(login, s);
  assert.equal(r.login, '359586015829802');
  assert.equal(r.responses[0].toString(), 'LOAD');
  s.imei = r.login;
  r = tk103.decode(Buffer.from('359586015829802;'), s);
  assert.equal(r.responses[0].toString(), 'ON');
  const pos = Buffer.from('imei:359586015829802,tracker,2609071530,,F,153012.000,A,2333.0300,S,04637.9980,W,12.50,180;');
  r = tk103.decode(pos, s);
  const p = r.positions[0];
  assert.ok(Math.abs(p.lat + 23.5505) < 0.001);
  assert.equal(p.fixTime, Date.UTC(2026, 8, 7, 15, 30, 12));
  assert.equal(p.course, 180);
  assert.equal(p.alarm, undefined);
  r = tk103.decode(Buffer.from('imei:359586015829802,help me,2609071531,,F,153112.000,A,2333.0300,S,04637.9980,W,0.00,0;'), s);
  assert.equal(r.positions[0].alarm, 'sos');
});
