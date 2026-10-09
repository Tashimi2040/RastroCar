import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { HttpError, requireUser, scopeClientId, assertDeviceAccess, intParam, audit } from '../context.js';
import { queueCommand, COMMAND_LABELS } from '../../services/commands.js';

const schema = z.object({
  deviceId: z.number().int().positive(),
  type: z.enum(['engineStop', 'engineResume', 'positionSingle', 'reboot', 'factoryReset', 'setInterval', 'custom']),
  payload: z.string().max(200).optional().nullable(),
});

const CLIENT_ALLOWED = new Set(['engineStop', 'engineResume', 'positionSingle']);

export async function commandRoutes(app: FastifyInstance) {
  app.get('/api/commands/types', async () => COMMAND_LABELS);

  app.get('/api/commands', async (req) => {
    const scope = scopeClientId(req);
    const q = req.query as { deviceId?: string; vehicleId?: string; limit?: string };
    const deviceId = q.deviceId ? intParam(q.deviceId, 'deviceId') : null;
    const vehicleId = q.vehicleId ? intParam(q.vehicleId, 'vehicleId') : null;
    return getDb().all(
      `SELECT c.*, d.imei, v.name AS vehicle_name, v.plate AS vehicle_plate, u.name AS user_name
       FROM commands c JOIN devices d ON d.id = c.device_id LEFT JOIN vehicles v ON v.id = d.vehicle_id LEFT JOIN users u ON u.id = c.created_by
       WHERE (? IS NULL OR v.client_id = ?) AND (? IS NULL OR c.device_id = ?) AND (? IS NULL OR d.vehicle_id = ?)
       ORDER BY c.id DESC LIMIT ?`,
      scope,
      scope,
      deviceId,
      deviceId,
      vehicleId,
      vehicleId,
      Math.min(500, Number(q.limit) || 100),
    );
  });

  app.post('/api/commands', async (req) => {
    const u = requireUser(req);
    const body = schema.parse(req.body);
    assertDeviceAccess(req, body.deviceId);
    if (u.role === 'client' && !CLIENT_ALLOWED.has(body.type)) throw new HttpError(403, 'Comando não permitido para o seu perfil');
    if (body.type === 'custom' && !body.payload?.trim()) throw new HttpError(400, 'Informe o conteúdo do comando');
    const result = queueCommand(body.deviceId, body.type, body.payload ?? null, u.sub);
    audit(req, 'command', 'device', body.deviceId, { type: body.type, payload: body.payload });
    return { ...result, message: result.sent ? 'Comando enviado ao rastreador' : 'Rastreador offline: comando ficará na fila e será enviado na próxima conexão' };
  });

  app.post('/api/commands/:id/cancel', async (req) => {
    const id = intParam((req.params as { id: string }).id);
    const db = getDb();
    const cmd = db.get<{ device_id: number; status: string }>('SELECT device_id, status FROM commands WHERE id = ?', id);
    if (!cmd) throw new HttpError(404, 'Comando não encontrado');
    assertDeviceAccess(req, cmd.device_id);
    if (cmd.status !== 'pending') throw new HttpError(400, 'Somente comandos pendentes podem ser cancelados');
    db.run("UPDATE commands SET status = 'cancelled' WHERE id = ?", id);
    return { ok: true };
  });
}
