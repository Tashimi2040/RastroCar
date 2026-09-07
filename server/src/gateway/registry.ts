import type { Session } from './types.js';

/** Sessões TCP ativas indexadas por IMEI. */
class SessionRegistry {
  private byImei = new Map<string, Session>();
  private all = new Set<Session>();

  add(session: Session) {
    this.all.add(session);
  }

  bind(imei: string, session: Session) {
    const existing = this.byImei.get(imei);
    if (existing && existing !== session) {
      // Conexão antiga do mesmo rastreador: encerra para evitar duplicidade
      existing.socket.destroy();
      this.all.delete(existing);
    }
    session.imei = imei;
    this.byImei.set(imei, session);
  }

  remove(session: Session) {
    this.all.delete(session);
    if (session.imei && this.byImei.get(session.imei) === session) this.byImei.delete(session.imei);
  }

  get(imei: string): Session | undefined {
    return this.byImei.get(imei);
  }

  isOnline(imei: string): boolean {
    const s = this.byImei.get(imei);
    return !!s && !s.socket.destroyed;
  }

  list(): Session[] {
    return [...this.all];
  }

  get size() {
    return this.all.size;
  }
}

export const registry = new SessionRegistry();
