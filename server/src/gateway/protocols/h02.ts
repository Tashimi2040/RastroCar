/**
 * Protocolo H02 (texto). Usado por Sinotrack ST-901/ST-906/ST-915, TK-Star,
 * Xexun clones e vários "rastreadores com app" baratos.
 *
 * Exemplo:
 * *HQ,353588123456789,V1,101010,A,2233.9000,S,04638.5000,W,000.00,000,070926,FFFFFBFF,724,05,1234,5678#
 */
import { knotsToKmh, nmeaToDecimal } from '../../services/geo.js';
import type { AlarmType, DecodeResult, DecodedPosition, DeviceCommand, ProtocolHandler, Session } from '../types.js';
import { emptyResult } from '../types.js';

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0');
}

function nowHHMMSS(): string {
  const d = new Date();
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function parseDateTime(hhmmss: string, ddmmyy: string): number {
  if (!/^\d{6}$/.test(hhmmss) || !/^\d{6}$/.test(ddmmyy)) return Date.now();
  const hh = +hhmmss.slice(0, 2);
  const mi = +hhmmss.slice(2, 4);
  const ss = +hhmmss.slice(4, 6);
  const dd = +ddmmyy.slice(0, 2);
  const mm = +ddmmyy.slice(2, 4);
  const yy = 2000 + +ddmmyy.slice(4, 6);
  const t = Date.UTC(yy, mm - 1, dd, hh, mi, ss);
  return Number.isFinite(t) ? t : Date.now();
}

function decodeStatus(hex: string): { ignition?: boolean; alarm?: AlarmType; blocked?: boolean } {
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) return {};
  const status = parseInt(hex, 16) >>> 0;
  const bit = (n: number) => ((status >>> n) & 1) === 1;
  // No H02 os bits de alarme são "ativos em zero".
  let alarm: AlarmType | undefined;
  if (!bit(0)) alarm = 'vibration';
  else if (!bit(1) || !bit(18)) alarm = 'sos';
  else if (!bit(2)) alarm = 'overspeed';
  else if (!bit(19)) alarm = 'powerCut';
  else if (!bit(13)) alarm = 'lowBattery';
  return { ignition: bit(10), alarm, blocked: !bit(11) };
}

export const h02: ProtocolHandler = {
  name: 'h02',

  detect(buffer) {
    return buffer.length >= 3 && buffer[0] === 0x2a && buffer[1] === 0x48 && buffer[2] === 0x51; // "*HQ"
  },

  frameLength(buffer) {
    if (buffer[0] !== 0x2a) return -1;
    const end = buffer.indexOf(0x23); // '#'
    if (end === -1) return buffer.length > 2048 ? -1 : 0;
    return end + 1;
  },

  decode(frame, session): DecodeResult {
    const result = emptyResult();
    const text = frame.toString('latin1').trim();
    const body = text.replace(/^\*/, '').replace(/#$/, '');
    const parts = body.split(',');
    if (parts[0] !== 'HQ' || parts.length < 3) return result;
    const imei = parts[1];
    const type = parts[2];
    if (!session.imei || session.imei !== imei) result.login = imei;
    session.imei = imei;

    if (type === 'V1' || type === 'V4' || type === 'V19' || type === 'V3' || type === 'VP1') {
      // V4 é resposta de comando: *HQ,imei,V4,CMD,...
      if (type === 'V4') {
        result.commandResponse = parts.slice(3).join(',');
        result.info = `resposta comando: ${result.commandResponse}`;
        return result;
      }
      if (parts.length < 12) return result;
      const time = parts[3];
      const valid = parts[4] === 'A';
      const lat = nmeaToDecimal(parts[5], parts[6]);
      const lng = nmeaToDecimal(parts[7], parts[8]);
      const speed = knotsToKmh(parseFloat(parts[9]) || 0);
      const course = parseFloat(parts[10]) || 0;
      const date = parts[11];
      const st = decodeStatus(parts[12] ?? '');
      const pos: DecodedPosition = {
        imei,
        protocol: 'h02',
        fixTime: parseDateTime(time, date),
        valid,
        lat,
        lng,
        speed: Math.round(speed * 10) / 10,
        course,
        ignition: st.ignition,
        alarm: st.alarm,
        blocked: st.blocked,
        raw: text,
        attributes: { status: parts[12] },
      };
      if (parts.length >= 17) {
        pos.attributes!.mcc = parts[13];
        pos.attributes!.mnc = parts[14];
        pos.attributes!.lac = parts[15];
        pos.attributes!.cid = parts[16];
      }
      result.positions.push(pos);
      // Confirmação (alguns modelos exigem para manter a conexão)
      const d = new Date();
      const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      result.responses.push(Buffer.from(`*HQ,${imei},V4,V1,${stamp}#`, 'latin1'));
      result.info = `posição ${lat.toFixed(5)},${lng.toFixed(5)} ${pos.speed}km/h`;
    } else if (type === 'NBR' || type === 'LINK' || type === 'XT' || type === 'HTBT') {
      // LBS ou heartbeat: apenas mantém a sessão ativa
      result.statuses.push({ imei, protocol: 'h02', time: Date.now() });
      result.info = `heartbeat ${type}`;
    } else {
      result.info = `mensagem ${type} não tratada`;
    }
    return result;
  },

  encodeCommand(command, session) {
    if (!session.imei) return null;
    const t = nowHHMMSS();
    let text: string | null = null;
    switch (command.type) {
      case 'engineStop':
        text = `*HQ,${session.imei},S20,${t},1,1#`;
        break;
      case 'engineResume':
        text = `*HQ,${session.imei},S20,${t},1,0#`;
        break;
      case 'positionSingle':
        text = `*HQ,${session.imei},CR,${t}#`;
        break;
      case 'reboot':
        text = `*HQ,${session.imei},CQ,${t}#`;
        break;
      case 'setInterval': {
        const s = Math.max(5, Math.min(3600, Number(command.payload) || 10));
        text = `*HQ,${session.imei},S71,${t},22,${s}#`;
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
