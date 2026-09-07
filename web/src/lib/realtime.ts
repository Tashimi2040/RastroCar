import { useEffect, useRef } from 'react';
import { getToken } from './api';

export type RealtimeMessage =
  | { type: 'hello'; data: { time: number } }
  | { type: 'position'; data: any }
  | { type: 'event'; data: any }
  | { type: 'device'; data: any }
  | { type: 'command'; data: any }
  | { type: 'trip'; data: any };

type Listener = (msg: RealtimeMessage) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let wantConnection = false;

function connect() {
  if (!wantConnection) return;
  const token = getToken();
  if (!token) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as RealtimeMessage;
      for (const l of listeners) l(msg);
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    socket = null;
    if (wantConnection) reconnectTimer = window.setTimeout(connect, 3000);
  };
  ws.onerror = () => ws.close();
}

export function startRealtime() {
  wantConnection = true;
  if (!socket) connect();
}

export function stopRealtime() {
  wantConnection = false;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
}

/** Assina mensagens em tempo real. O callback mais recente é sempre usado. */
export function useRealtime(handler: Listener) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const l: Listener = (m) => ref.current(m);
    listeners.add(l);
    startRealtime();
    return () => {
      listeners.delete(l);
    };
  }, []);
}
