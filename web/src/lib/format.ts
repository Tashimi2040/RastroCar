import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.locale('pt-br');
dayjs.extend(relativeTime);

export { dayjs };

export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return dayjs(ts).format('DD/MM/YYYY HH:mm:ss');
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  return dayjs(ts).format('DD/MM/YYYY');
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return dayjs(ts).format('HH:mm');
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return 'nunca';
  return dayjs(ts).fromNow();
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}

export function fmtSpeed(kmh: number | null | undefined): string {
  if (kmh == null) return '—';
  return `${Math.round(kmh)} km/h`;
}

export function toInputDateTime(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DDTHH:mm');
}

export function fromInputDateTime(v: string): string {
  return dayjs(v).toISOString();
}

export const STATE_LABEL: Record<string, string> = {
  moving: 'Em movimento',
  idle: 'Parado (ligado)',
  stopped: 'Parado',
  offline: 'Sem sinal',
  no_device: 'Sem rastreador',
};

export const STATE_COLOR: Record<string, string> = {
  moving: '#16a34a',
  idle: '#f59e0b',
  stopped: '#3b82f6',
  offline: '#ef4444',
  no_device: '#9ca3af',
};

export const VEHICLE_TYPES: Record<string, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
  truck: 'Caminhão',
  van: 'Van / Utilitário',
  bus: 'Ônibus',
  other: 'Outro',
};

export const COMMAND_STATUS: Record<string, string> = {
  pending: 'Na fila',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export const EVENT_TYPES: Record<string, string> = {
  ignitionOn: 'Ignição ligada',
  ignitionOff: 'Ignição desligada',
  overspeed: 'Excesso de velocidade',
  geofenceEnter: 'Entrada em cerca',
  geofenceExit: 'Saída de cerca',
  online: 'Online',
  offline: 'Sem comunicação',
  sos: 'SOS',
  powerCut: 'Alimentação cortada',
  vibration: 'Vibração',
  lowBattery: 'Bateria baixa',
  lowPower: 'Tensão baixa',
  movement: 'Movimento',
  tamper: 'Violação',
  engineBlocked: 'Motor bloqueado',
  engineUnblocked: 'Motor desbloqueado',
  commandResponse: 'Resposta de comando',
  accident: 'Colisão',
  jamming: 'Jammer',
  gpsAntennaCut: 'Antena GPS',
  door: 'Porta',
  powerOn: 'Rastreador ligado',
  powerOff: 'Rastreador desligado',
  general: 'Alarme',
};
