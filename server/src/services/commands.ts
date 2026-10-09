import { getDb } from '../db/index.js';
import { registry } from '../gateway/registry.js';
import { getProtocol } from '../gateway/protocols/index.js';
import type { CommandType, DeviceCommand, ProtocolName } from '../gateway/types.js';
import { getSettings } from './settings.js';
import { hub } from '../ws/hub.js';
import { logger } from '../logger.js';
import { createEvent } from './events.js';

export const COMMAND_LABELS: Record<CommandType, string> = {
  engineStop: 'Bloquear motor',
  engineResume: 'Desbloquear motor',
  positionSingle: 'Solicitar posição',
  reboot: 'Reiniciar rastreador',
  factoryReset: 'Restaurar padrão de fábrica',
  setInterval: 'Alterar intervalo de envio',
  custom: 'Comando personalizado',
};

interface CommandRow {
  id: number;
  device_id: number;
  type: CommandType;
  payload: string | null;
  status: string;
  created_at: number;
}

function broadcastCommand(id: number) {
  const db = getDb();
  const row = db.get<{ device_id: number }>(
    'SELECT c.*, d.imei, v.client_id FROM commands c JOIN devices d ON d.id = c.device_id LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE c.id = ?',
    id,
  ) as (Record<string, unknown> & { client_id?: number | null }) | undefined;
  if (row) hub.broadcast((row.client_id as number | null) ?? null, { type: 'command', data: row });
}

export function queueCommand(deviceId: number, type: CommandType, payload: string | null, userId: number | null) {
  const db = getDb();
  const now = Date.now();
  const r = db.run(
    `INSERT INTO commands (device_id, type, payload, status, created_by, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    deviceId,
    type,
    payload,
    userId,
    now,
  );
  const sent = dispatchPending(deviceId);
  broadcastCommand(r.lastId);
  return { id: r.lastId, sent: sent > 0 };
}

/** Tenta enviar comandos pendentes para o rastreador se estiver conectado. Retorna quantos foram enviados. */
export function dispatchPending(deviceId: number): number {
  const db = getDb();
  const device = db.get<{ id: number; imei: string; protocol: ProtocolName | null; vehicle_id: number | null }>('SELECT id, imei, protocol, vehicle_id FROM devices WHERE id = ?', deviceId);
  if (!device) return 0;
  const session = registry.get(device.imei);
  if (!session || session.socket.destroyed || !session.protocol) return 0;
  const pending = db.all<CommandRow>("SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY id ASC", deviceId);
  let count = 0;
  const handler = getProtocol(session.protocol);
  const password = getSettings().device_default_password;
  for (const c of pending) {
    const cmd: DeviceCommand = { id: c.id, type: c.type, payload: c.payload, password };
    let frame: Buffer | null;
    try {
      frame = handler.encodeCommand(cmd, session);
    } catch (err) {
      frame = null;
      logger.error({ err, command: c.id }, 'erro ao codificar comando');
    }
    if (!frame) {
      db.run("UPDATE commands SET status = 'failed', error = ? WHERE id = ?", `Comando não suportado pelo protocolo ${session.protocol}`, c.id);
      broadcastCommand(c.id);
      continue;
    }
    session.socket.write(frame);
    db.run("UPDATE commands SET status = 'sent', sent_at = ? WHERE id = ?", Date.now(), c.id);
    logger.info({ imei: device.imei, type: c.type, frame: session.protocol === 'gt06' ? frame.toString('hex') : frame.toString('latin1') }, 'comando enviado');
    broadcastCommand(c.id);
    count++;
  }
  return count;
}

/** Registra a resposta textual do rastreador ao último comando enviado. */
export function handleCommandResponse(imei: string, response: string) {
  const db = getDb();
  const device = db.get<{ id: number; vehicle_id: number | null; name: string | null }>('SELECT id, vehicle_id, name FROM devices WHERE imei = ?', imei);
  if (!device) return;
  const cmd = db.get<CommandRow>("SELECT * FROM commands WHERE device_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1", device.id);
  if (cmd) {
    const failed = /fail|error|invalid|unsupport|wrong|não/i.test(response);
    db.run('UPDATE commands SET status = ?, response = ?, confirmed_at = ? WHERE id = ?', failed ? 'failed' : 'confirmed', response, Date.now(), cmd.id);
    broadcastCommand(cmd.id);
    const vehicle = device.vehicle_id ? db.get<{ client_id: number; name: string }>('SELECT client_id, name FROM vehicles WHERE id = ?', device.vehicle_id) : undefined;
    createEvent({
      deviceId: device.id,
      vehicleId: device.vehicle_id,
      clientId: vehicle?.client_id,
      type: 'commandResponse',
      severity: failed ? 'warning' : 'info',
      title: `${COMMAND_LABELS[cmd.type] ?? cmd.type}: ${failed ? 'falhou' : 'confirmado'}`,
      message: response,
      data: { commandId: cmd.id },
    });
  }
}

/** Marca como falhos comandos pendentes há mais de 24h. */
export function expireStaleCommands() {
  const cutoff = Date.now() - 24 * 3600000;
  const db = getDb();
  const rows = db.all<{ id: number }>("SELECT id FROM commands WHERE status IN ('pending','sent') AND created_at < ?", cutoff);
  for (const r of rows) {
    db.run("UPDATE commands SET status = 'failed', error = 'Expirado: rastreador não respondeu em 24h' WHERE id = ?", r.id);
    broadcastCommand(r.id);
  }
  return rows.length;
}
