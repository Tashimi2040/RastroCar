import net, { type Socket } from 'node:net';
import { detectProtocol, getProtocol } from './protocols/index.js';
import type { ProtocolHandler, ProtocolName, Session } from './types.js';
import { registry } from './registry.js';
import { ingestPosition, ingestStatus, findOrCreateDevice } from '../services/tracking.js';
import { dispatchPending, handleCommandResponse } from '../services/commands.js';
import { logger } from '../logger.js';
import { getDb } from '../db/index.js';

const SOCKET_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 64 * 1024;
let nextSessionId = 1;

export interface GatewayServer {
  port: number;
  protocol: ProtocolName | 'auto';
  server: net.Server;
}

function handleConnection(socket: Socket, fixedProtocol?: ProtocolHandler) {
  const session: Session = {
    id: nextSessionId++,
    socket,
    remoteAddress: socket.remoteAddress?.replace('::ffff:', '') ?? 'desconhecido',
    protocol: fixedProtocol?.name,
    buffer: Buffer.alloc(0),
    serial: 1,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    state: {},
  };
  let handler: ProtocolHandler | undefined = fixedProtocol;
  registry.add(session);
  socket.setTimeout(SOCKET_TIMEOUT_MS);
  socket.setKeepAlive(true, 60000);
  logger.debug({ session: session.id, ip: session.remoteAddress }, 'conexão tcp');

  socket.on('data', (chunk: Buffer) => {
    session.lastActivity = Date.now();
    session.buffer = session.buffer.length ? Buffer.concat([session.buffer, chunk]) : chunk;
    if (session.buffer.length > MAX_BUFFER) {
      logger.warn({ session: session.id, ip: session.remoteAddress }, 'buffer excedido, encerrando conexão');
      socket.destroy();
      return;
    }
    if (!handler) {
      const detected = detectProtocol(session.buffer);
      if (!detected) {
        if (session.buffer.length >= 32) {
          logger.warn({ ip: session.remoteAddress, head: session.buffer.subarray(0, 32).toString('hex') }, 'protocolo desconhecido, encerrando');
          socket.destroy();
        }
        return;
      }
      handler = detected;
      session.protocol = detected.name;
    }
    processBuffer(session, handler);
  });

  socket.on('timeout', () => {
    logger.debug({ session: session.id, imei: session.imei }, 'sessão ociosa, encerrando');
    socket.destroy();
  });
  socket.on('error', (err) => {
    logger.debug({ session: session.id, imei: session.imei, err: err.message }, 'erro de socket');
  });
  socket.on('close', () => {
    registry.remove(session);
    logger.debug({ session: session.id, imei: session.imei }, 'conexão encerrada');
  });
}

function processBuffer(session: Session, handler: ProtocolHandler) {
  let guard = 0;
  while (session.buffer.length > 0 && guard++ < 100) {
    const len = handler.frameLength(session.buffer);
    if (len === 0) return;
    if (len < 0) {
      session.buffer = session.buffer.subarray(1);
      continue;
    }
    const frame = session.buffer.subarray(0, len);
    session.buffer = session.buffer.subarray(len);
    try {
      handleFrame(session, handler, frame);
    } catch (err) {
      logger.error({ err, imei: session.imei, frame: frame.toString('hex') }, 'erro ao processar frame');
    }
  }
}

function handleFrame(session: Session, handler: ProtocolHandler, frame: Buffer) {
  const result = handler.decode(frame, session);
  const ip = session.remoteAddress;

  if (result.login) {
    registry.bind(result.login, session);
    const device = findOrCreateDevice(result.login, handler.name, ip);
    if (!device) {
      logger.warn({ imei: result.login, ip }, 'rastreador desconhecido rejeitado (auto-registro desligado)');
      session.socket.destroy();
      return;
    }
    if (device.status === 'disabled') {
      logger.warn({ imei: result.login }, 'rastreador desativado tentou conectar');
      session.socket.destroy();
      return;
    }
    getDb().run('UPDATE devices SET last_seen_at = ?, last_ip = ?, protocol = ? WHERE id = ?', Date.now(), ip, handler.name, device.id);
    ingestStatus({ imei: result.login, protocol: handler.name, time: Date.now() }, ip);
    logger.info({ imei: result.login, protocol: handler.name, ip }, 'rastreador conectado');
  }

  for (const r of result.responses) {
    if (!session.socket.destroyed) session.socket.write(r);
  }

  if (result.info) logger.debug({ imei: session.imei, protocol: handler.name }, result.info);

  for (const status of result.statuses) ingestStatus(status, ip);
  for (const pos of result.positions) ingestPosition(pos, ip);
  if (result.commandResponse && session.imei) handleCommandResponse(session.imei, result.commandResponse);

  // Após login (ou qualquer mensagem), tenta despachar comandos pendentes
  if (session.imei) {
    const device = getDb().get<{ id: number }>('SELECT id FROM devices WHERE imei = ?', session.imei);
    if (device) dispatchPending(device.id);
  }
}

export function startGateway(ports: { port: number; protocol: ProtocolName | 'auto' }[], host = '0.0.0.0'): Promise<GatewayServer[]> {
  const servers: GatewayServer[] = [];
  return Promise.all(
    ports
      .filter((p) => p.port > 0)
      .map(
        (p) =>
          new Promise<void>((resolve, reject) => {
            const fixed = p.protocol === 'auto' ? undefined : getProtocol(p.protocol);
            const server = net.createServer((socket) => handleConnection(socket, fixed));
            server.on('error', reject);
            server.listen(p.port, host, () => {
              logger.info({ port: p.port, protocol: p.protocol }, 'gateway tcp de rastreadores ouvindo');
              servers.push({ port: p.port, protocol: p.protocol, server });
              resolve();
            });
          }),
      ),
  ).then(() => servers);
}

export function gatewayStats() {
  const sessions = registry.list();
  return {
    connections: sessions.length,
    identified: sessions.filter((s) => s.imei).length,
    sessions: sessions.map((s) => ({ id: s.id, imei: s.imei ?? null, protocol: s.protocol ?? null, ip: s.remoteAddress, connectedAt: s.connectedAt, lastActivity: s.lastActivity })),
  };
}
