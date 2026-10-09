import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { config } from '../config.js';

interface Client {
  ws: WebSocket;
  user: TokenPayload;
  alive: boolean;
}

export type HubMessage =
  | { type: 'position'; data: Record<string, unknown> }
  | { type: 'event'; data: Record<string, unknown> }
  | { type: 'device'; data: Record<string, unknown> }
  | { type: 'command'; data: Record<string, unknown> }
  | { type: 'trip'; data: Record<string, unknown> };

class Hub {
  private clients = new Set<Client>();
  private wss?: WebSocketServer;
  private timer?: NodeJS.Timeout;

  attach(server: Server, path = '/ws') {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== path) return; // deixa outros handlers (ex.: Vite) tratarem
      const token = url.searchParams.get('token') ?? '';
      const user = verifyToken(token, config.jwtSecret);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        const client: Client = { ws, user, alive: true };
        this.clients.add(client);
        ws.on('pong', () => (client.alive = true));
        ws.on('close', () => this.clients.delete(client));
        ws.on('error', () => this.clients.delete(client));
        ws.send(JSON.stringify({ type: 'hello', data: { time: Date.now() } }));
      });
    });
    this.timer = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          this.clients.delete(c);
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 30000);
  }

  /** Envia para admins/operadores e para usuários do cliente informado. */
  broadcast(clientId: number | null | undefined, message: HubMessage) {
    const payload = JSON.stringify(message);
    for (const c of this.clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      const u = c.user;
      const isStaff = u.role === 'admin' || u.role === 'operator';
      if (isStaff || (clientId != null && u.clientId === clientId)) {
        c.ws.send(payload);
      }
    }
  }

  get connectedCount() {
    return this.clients.size;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    for (const c of this.clients) c.ws.close();
    this.wss?.close();
  }
}

export const hub = new Hub();
