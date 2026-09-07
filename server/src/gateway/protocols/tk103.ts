/**
 * Protocolo TK103 / Coban / GPS103 (texto). Usado por TK103A/B, TK104, TK106,
 * GPS103, GPS303 e clones "Coban".
 *
 * Login:      ##,imei:359586015829802,A;              -> resposta LOAD
 * Heartbeat:  359586015829802;                        -> resposta ON
 * Posição:    imei:359586015829802,tracker,2609071530,,F,153012.000,A,2233.9000,S,04638.5000,W,12.50,180;
 */
import { knotsToKmh, nmeaToDecimal } from '../../services/geo.js';
import type { AlarmType, DecodeResult, DecodedPosition, DeviceCommand, ProtocolHandler, Session } from '../types.js';
import { emptyResult } from '../types.js';

const ALARM_MAP: Record<string, AlarmType> = {
  'help me': 'sos',
  'help me!': 'sos',
  'low battery': 'lowBattery',
  'stockade': 'geofenceExit',
  'move': 'movement',
  'speed': 'overspeed',
  'acc on': 'accOn',
  'acc off': 'accOff',
  'door alarm': 'door',
  'sensor alarm': 'vibration',
  'ac alarm': 'powerCut',
  'accident alarm': 'accident',
  'oil': 'general',
  'et': 'general',
};

function parseDate(dateField: string, timeField: string): number {
  // dateField: YYMMDDHHMM ou YYMMDDHHMMSS ; timeField: HHMMSS.sss (UTC)
  const d = dateField.replace(/\D/g, '');
  if (d.length < 6) return Date.now();
  const yy = 2000 + +d.slice(0, 2);
  const mm = +d.slice(2, 4);
  const dd = +d.slice(4, 6);
  let hh = +d.slice(6, 8) || 0;
  let mi = +d.slice(8, 10) || 0;
  let ss = +d.slice(10, 12) || 0;
  const t = timeField.replace(/\D/g, '');
  if (t.length >= 6) {
    hh = +t.slice(0, 2);
    mi = +t.slice(2, 4);
    ss = +t.slice(4, 6);
  }
  const ts = Date.UTC(yy, mm - 1, dd, hh, mi, ss);
  return Number.isFinite(ts) ? ts : Date.now();
}

export const tk103: ProtocolHandler = {
  name: 'tk103',

  detect(buffer) {
    const head = buffer.subarray(0, 24).toString('latin1');
    return /^##,imei:/.test(head) || /^imei:\d+/.test(head) || /^\d{15};/.test(head) || /^\d{15}$/.test(head.trim());
  },

  frameLength(buffer) {
    const semi = buffer.indexOf(0x3b); // ';'
    if (semi !== -1) return semi + 1;
    // Alguns heartbeats vêm sem ';' (apenas IMEI + \r\n)
    const nl = buffer.indexOf(0x0a);
    if (nl !== -1) return nl + 1;
    return buffer.length > 2048 ? -1 : 0;
  },

  decode(frame, session): DecodeResult {
    const result = emptyResult();
    const text = frame.toString('latin1').trim().replace(/;$/, '');
    if (!text) return result;

    if (text.startsWith('##')) {
      const m = text.match(/imei:(\d+)/);
      if (m) {
        result.login = m[1];
        result.responses.push(Buffer.from('LOAD', 'latin1'));
        result.info = `login ${m[1]}`;
      }
      return result;
    }

    if (/^\d{15}$/.test(text)) {
      if (!session.imei) result.login = text;
      result.responses.push(Buffer.from('ON', 'latin1'));
      result.statuses.push({ imei: text, protocol: 'tk103', time: Date.now() });
      result.info = 'heartbeat';
      return result;
    }

    const parts = text.split(',');
    const imeiMatch = parts[0].match(/imei:(\d+)/);
    if (!imeiMatch) {
      result.info = 'mensagem não reconhecida';
      return result;
    }
    const imei = imeiMatch[1];
    if (!session.imei) result.login = imei;
    const typeField = (parts[1] ?? '').toLowerCase().trim();
    if (parts.length < 12 || parts[4] === 'L') {
      // Sem GPS (LBS) ou mensagem curta
      result.statuses.push({ imei, protocol: 'tk103', time: Date.now(), alarm: ALARM_MAP[typeField] });
      result.info = `mensagem ${typeField} sem gps`;
      return result;
    }
    const valid = parts[6] === 'A';
    const lat = nmeaToDecimal(parts[7], parts[8]);
    const lng = nmeaToDecimal(parts[9], parts[10]);
    const speed = knotsToKmh(parseFloat(parts[11]) || 0);
    const course = parseFloat(parts[12]) || 0;
    const pos: DecodedPosition = {
      imei,
      protocol: 'tk103',
      fixTime: parseDate(parts[2], parts[5]),
      valid,
      lat,
      lng,
      speed: Math.round(speed * 10) / 10,
      course,
      raw: text,
      attributes: { type: typeField },
    };
    if (parts.length > 13 && parts[13] !== '') pos.altitude = parseFloat(parts[13]) || undefined;
    if (parts.length > 14 && (parts[14] === '0' || parts[14] === '1')) pos.ignition = parts[14] === '1';
    if (typeField === 'acc on') pos.ignition = true;
    if (typeField === 'acc off') pos.ignition = false;
    if (pos.ignition === undefined && session.state.ignition !== undefined) pos.ignition = session.state.ignition as boolean;
    if (pos.ignition !== undefined) session.state.ignition = pos.ignition;
    if (typeField !== 'tracker' && typeField !== '') pos.alarm = ALARM_MAP[typeField] ?? 'general';
    result.positions.push(pos);
    result.info = `posição ${lat.toFixed(5)},${lng.toFixed(5)} ${pos.speed}km/h`;
    return result;
  },

  encodeCommand(command, session) {
    if (!session.imei) return null;
    let text: string | null = null;
    switch (command.type) {
      case 'engineStop':
        text = `**,imei:${session.imei},J`;
        break;
      case 'engineResume':
        text = `**,imei:${session.imei},K`;
        break;
      case 'positionSingle':
        text = `**,imei:${session.imei},B`;
        break;
      case 'reboot':
        text = `**,imei:${session.imei},V`;
        break;
      case 'setInterval': {
        const s = Math.max(5, Math.min(3600, Number(command.payload) || 10));
        text = `**,imei:${session.imei},C,${String(s).padStart(3, '0')}s`;
        break;
      }
      case 'custom':
        text = command.payload?.trim() || null;
        break;
      default:
        return null;
    }
    return text ? Buffer.from(text, 'latin1') : null;
  },
};
