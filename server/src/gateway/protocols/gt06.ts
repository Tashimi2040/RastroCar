/**
 * Protocolo GT06 / GT06N / Concox (binário). Usado pela grande maioria dos
 * rastreadores chineses "sem mensalidade" vendidos no Brasil (GT06, GT06N,
 * TR02, TK-Star, WeTrack, JM-VL01, ET300, GT02A, X3, entre outros).
 *
 * Frame:  78 78 | LEN(1) | PROTO(1) | CONTEUDO | SERIAL(2) | CRC(2) | 0D 0A
 *         79 79 | LEN(2) | PROTO(1) | CONTEUDO | SERIAL(2) | CRC(2) | 0D 0A
 */
import { crc16itu } from './crc.js';
import type { AlarmType, DecodeResult, DecodedPosition, DecodedStatus, DeviceCommand, ProtocolHandler, Session } from '../types.js';
import { emptyResult } from '../types.js';

const MSG_LOGIN = 0x01;
const MSG_GPS_LBS_1 = 0x12;
const MSG_GPS_LBS_2 = 0x22;
const MSG_GPS_LBS_3 = 0x37;
const MSG_GPS_LBS_4 = 0x2d;
const MSG_STATUS = 0x13;
const MSG_ALARM = 0x16;
const MSG_ALARM_2 = 0x26;
const MSG_ALARM_3 = 0x27;
const MSG_GPS_LBS_STATUS_3 = 0x19;
const MSG_STRING = 0x15;
const MSG_COMMAND_0 = 0x80;
const MSG_COMMAND_RESPONSE = 0x21;
const MSG_TIME_REQUEST = 0x8a;
const MSG_INFO = 0x94;
const MSG_LBS_MULTIPLE = 0x28;
const MSG_LBS_EXTEND = 0x18;
const MSG_LBS_STATUS = 0x19;
const MSG_GPS_PHONE = 0x1a;
const MSG_GPS_LBS_EXTEND = 0x1e;
const MSG_HEARTBEAT_2 = 0x23;
const MSG_ADDRESS_REQUEST = 0x2a;
const MSG_ALARM_4 = 0xa4;
const MSG_GPS_LBS_5 = 0xa0;
const MSG_FENCE_MULTI = 0x2c;

const ALARM_MAP: Record<number, AlarmType | undefined> = {
  0x01: 'sos',
  0x02: 'powerCut',
  0x03: 'vibration',
  0x04: 'geofenceEnter',
  0x05: 'geofenceExit',
  0x06: 'overspeed',
  0x09: 'movement',
  0x0c: 'powerOn',
  0x0e: 'lowPower',
  0x0f: 'lowPower',
  0x11: 'powerOff',
  0x13: 'tamper',
  0x14: 'door',
  0x15: 'lowBattery',
  0x17: 'lowBattery',
  0x19: 'lowBattery',
  0x22: 'accident',
  0x23: 'accident',
  0x28: 'gpsAntennaCut',
  0x29: 'accident',
  0x30: 'jamming',
  0xfe: 'accOn',
  0xff: 'accOff',
};

function bcdImei(buf: Buffer): string {
  let s = '';
  for (const b of buf) s += ((b >> 4) & 0x0f).toString() + (b & 0x0f).toString();
  // 8 bytes BCD = 16 dígitos, IMEI tem 15 (primeiro dígito é 0 de preenchimento)
  return s.length === 16 && s.startsWith('0') ? s.slice(1) : s;
}

function readDateTime(buf: Buffer, offset: number): number {
  const year = 2000 + buf[offset];
  const month = buf[offset + 1];
  const day = buf[offset + 2];
  const hour = buf[offset + 3];
  const min = buf[offset + 4];
  const sec = buf[offset + 5];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59 || sec > 59) return NaN;
  return Date.UTC(year, month - 1, day, hour, min, sec);
}

function voltageLevelToPercent(level: number): number {
  const table = [0, 5, 20, 40, 60, 80, 100];
  return table[Math.min(level, 6)] ?? 100;
}

export function buildGt06Frame(proto: number, content: Buffer, serial: number): Buffer {
  const len = 1 + content.length + 2 + 2;
  const useLong = len > 0xff;
  const headerLen = useLong ? 4 : 3;
  const frame = Buffer.alloc(headerLen + len + 2);
  let o = 0;
  if (useLong) {
    frame[o++] = 0x79;
    frame[o++] = 0x79;
    frame.writeUInt16BE(len, o);
    o += 2;
  } else {
    frame[o++] = 0x78;
    frame[o++] = 0x78;
    frame[o++] = len;
  }
  const crcStart = useLong ? 2 : 2;
  frame[o++] = proto;
  content.copy(frame, o);
  o += content.length;
  frame.writeUInt16BE(serial & 0xffff, o);
  o += 2;
  const crc = crc16itu(frame.subarray(crcStart, o));
  frame.writeUInt16BE(crc, o);
  o += 2;
  frame[o++] = 0x0d;
  frame[o++] = 0x0a;
  return frame;
}

function ack(proto: number, serial: number): Buffer {
  return buildGt06Frame(proto, Buffer.alloc(0), serial);
}

interface GpsBlock {
  fixTime: number;
  satellites: number;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  valid: boolean;
  realtime: boolean;
  length: number;
}

function parseGps(content: Buffer, offset: number): GpsBlock | null {
  if (content.length < offset + 6 + 12) return null;
  const fixTime = readDateTime(content, offset);
  const b = content[offset + 6];
  const gpsLen = (b >> 4) & 0x0f;
  const satellites = b & 0x0f;
  const rawLat = content.readUInt32BE(offset + 7);
  const rawLng = content.readUInt32BE(offset + 11);
  const speed = content[offset + 15];
  const cs = content.readUInt16BE(offset + 16);
  const course = cs & 0x03ff;
  const valid = (cs & 0x1000) !== 0;
  const realtime = (cs & 0x2000) === 0;
  let lat = rawLat / 1800000;
  let lng = rawLng / 1800000;
  if ((cs & 0x0400) === 0) lat = -lat; // bit10: 1 = Norte, 0 = Sul
  if ((cs & 0x0800) !== 0) lng = -lng; // bit11: 1 = Oeste, 0 = Leste
  return { fixTime, satellites, lat, lng, speed, course, valid, realtime, length: 6 + Math.max(gpsLen, 12) };
}

function decodeTerminalInfo(b: number) {
  const alarmBits = (b >> 3) & 0x07;
  const alarm: AlarmType | undefined = ([undefined, 'vibration', 'powerCut', 'lowBattery', 'sos'] as const)[alarmBits];
  return {
    armed: (b & 0x01) !== 0,
    ignition: (b & 0x02) !== 0,
    charging: (b & 0x04) !== 0,
    gpsTracking: (b & 0x40) !== 0,
    blocked: (b & 0x80) !== 0,
    alarm,
  };
}

export const gt06: ProtocolHandler = {
  name: 'gt06',

  detect(buffer) {
    return buffer.length >= 2 && ((buffer[0] === 0x78 && buffer[1] === 0x78) || (buffer[0] === 0x79 && buffer[1] === 0x79));
  },

  frameLength(buffer) {
    if (buffer.length < 5) return 0;
    if (buffer[0] === 0x78 && buffer[1] === 0x78) {
      const len = buffer[2];
      const total = len + 5;
      if (len < 5) return -1;
      if (buffer.length < total) return 0;
      if (buffer[total - 2] !== 0x0d || buffer[total - 1] !== 0x0a) return -1;
      return total;
    }
    if (buffer[0] === 0x79 && buffer[1] === 0x79) {
      const len = buffer.readUInt16BE(2);
      const total = len + 6;
      if (len < 5) return -1;
      if (buffer.length < total) return 0;
      if (buffer[total - 2] !== 0x0d || buffer[total - 1] !== 0x0a) return -1;
      return total;
    }
    return -1;
  },

  decode(frame, session) {
    const result = emptyResult();
    const isLong = frame[0] === 0x79;
    const len = isLong ? frame.readUInt16BE(2) : frame[2];
    const protoIdx = isLong ? 4 : 3;
    const proto = frame[protoIdx];
    const contentStart = protoIdx + 1;
    const contentEnd = contentStart + (len - 5);
    const content = frame.subarray(contentStart, contentEnd);
    const serial = frame.readUInt16BE(contentEnd);
    const crcReceived = frame.readUInt16BE(contentEnd + 2);
    const crcCalc = crc16itu(frame.subarray(2, contentEnd + 2));
    const crcOk = crcReceived === crcCalc;
    session.serial = serial;
    const raw = frame.toString('hex');
    const now = Date.now();

    if (!crcOk) {
      // Alguns clones calculam CRC errado; seguimos, mas registramos.
      result.info = `crc inválido (recebido ${crcReceived.toString(16)}, esperado ${crcCalc.toString(16)})`;
    }

    const imei = session.imei;

    switch (proto) {
      case MSG_LOGIN: {
        if (content.length < 8) break;
        const id = bcdImei(content.subarray(0, 8));
        result.login = id;
        if (content.length >= 10) session.state.typeId = content.readUInt16BE(8).toString(16).padStart(4, '0');
        result.responses.push(ack(MSG_LOGIN, serial));
        result.info = `login ${id}`;
        break;
      }

      case MSG_STATUS:
      case MSG_HEARTBEAT_2: {
        if (!imei) break;
        const ti = decodeTerminalInfo(content[0] ?? 0);
        const status: DecodedStatus = {
          imei,
          protocol: 'gt06',
          time: now,
          ignition: ti.ignition,
          charging: ti.charging,
          blocked: ti.blocked,
          batteryLevel: content.length > 1 ? voltageLevelToPercent(content[1]) : undefined,
          gsmSignal: content.length > 2 ? Math.min(100, content[2] * 25) : undefined,
          alarm: ti.alarm,
          attributes: { armed: ti.armed, gpsTracking: ti.gpsTracking },
        };
        session.state.ignition = ti.ignition;
        session.state.blocked = ti.blocked;
        result.statuses.push(status);
        result.responses.push(ack(proto, serial));
        result.info = 'heartbeat';
        break;
      }

      case MSG_GPS_LBS_1:
      case MSG_GPS_LBS_2:
      case MSG_GPS_LBS_3:
      case MSG_GPS_LBS_4:
      case MSG_GPS_LBS_5:
      case MSG_GPS_LBS_EXTEND:
      case MSG_GPS_PHONE:
      case MSG_GPS_LBS_STATUS_3:
      case MSG_ALARM:
      case MSG_ALARM_2:
      case MSG_ALARM_3:
      case MSG_ALARM_4: {
        if (!imei) {
          result.responses.push(ack(proto, serial));
          break;
        }
        const gps = parseGps(content, 0);
        if (!gps) break;
        const pos: DecodedPosition = {
          imei,
          protocol: 'gt06',
          fixTime: Number.isFinite(gps.fixTime) ? gps.fixTime : now,
          valid: gps.valid,
          lat: gps.lat,
          lng: gps.lng,
          speed: gps.speed,
          course: gps.course,
          satellites: gps.satellites,
          raw,
          attributes: { realtime: gps.realtime, msgType: proto.toString(16) },
        };
        let offset = gps.length;
        const isAlarm = proto === MSG_ALARM || proto === MSG_ALARM_2 || proto === MSG_ALARM_3 || proto === MSG_ALARM_4 || proto === MSG_GPS_LBS_STATUS_3;

        if (isAlarm) {
          // LBS com byte de tamanho + status (terminal info, voltage, gsm, alarm, language)
          if (content.length >= offset + 1) {
            const lbsLen = content[offset];
            offset += 1 + (lbsLen >= 8 && lbsLen <= 20 ? lbsLen : 8);
          }
          if (content.length >= offset + 5) {
            const ti = decodeTerminalInfo(content[offset]);
            pos.ignition = ti.ignition;
            pos.blocked = ti.blocked;
            pos.batteryLevel = voltageLevelToPercent(content[offset + 1]);
            pos.gsmSignal = Math.min(100, content[offset + 2] * 25);
            const alarmCode = content[offset + 3];
            pos.alarm = ALARM_MAP[alarmCode] ?? ti.alarm ?? 'general';
            pos.attributes!.alarmCode = alarmCode;
            pos.attributes!.charging = ti.charging;
            session.state.ignition = ti.ignition;
          } else {
            pos.alarm = 'general';
          }
        } else {
          // LBS: MCC(2) MNC(1) LAC(2) CID(3) = 8 bytes (alguns modelos enviam mais)
          if (content.length >= offset + 8) {
            pos.attributes!.mcc = content.readUInt16BE(offset);
            pos.attributes!.mnc = content[offset + 2];
            pos.attributes!.lac = content.readUInt16BE(offset + 3);
            pos.attributes!.cid = content.readUIntBE(offset + 5, 3);
            offset += 8;
          }
          if (proto === MSG_GPS_LBS_2 || proto === MSG_GPS_LBS_3 || proto === MSG_GPS_LBS_4 || proto === MSG_GPS_LBS_5) {
            if (content.length >= offset + 1) {
              pos.ignition = content[offset] === 1;
              session.state.ignition = pos.ignition;
              offset += 1;
            }
            if (content.length >= offset + 1) {
              pos.attributes!.uploadMode = content[offset];
              offset += 1;
            }
            if (content.length >= offset + 1) {
              pos.attributes!.reupload = content[offset] === 1;
              offset += 1;
            }
            if (content.length >= offset + 4) {
              pos.odometerM = content.readUInt32BE(offset);
              offset += 4;
            }
          } else if (session.state.ignition !== undefined) {
            pos.ignition = session.state.ignition as boolean;
          }
        }
        if (session.state.blocked !== undefined && pos.blocked === undefined) pos.blocked = session.state.blocked as boolean;
        result.positions.push(pos);
        if (isAlarm) result.responses.push(ack(proto, serial));
        // Modelos que exigem ACK de posição (raro) toleram ACK extra; enviamos sempre para 0x22 e 0xA0.
        else if (proto === MSG_GPS_LBS_2 || proto === MSG_GPS_LBS_5) result.responses.push(ack(proto, serial));
        result.info = `${isAlarm ? 'alarme' : 'posição'} ${pos.lat.toFixed(5)},${pos.lng.toFixed(5)} ${pos.speed}km/h`;
        break;
      }

      case MSG_LBS_MULTIPLE:
      case MSG_LBS_EXTEND:
      case MSG_LBS_STATUS:
      case MSG_FENCE_MULTI: {
        // Somente célula (sem GPS) — ignorado, mas confirmamos recebimento
        result.responses.push(ack(proto, serial));
        result.info = 'lbs (sem gps)';
        break;
      }

      case MSG_STRING:
      case MSG_COMMAND_RESPONSE: {
        // byte0 = tamanho (flag 4 bytes + texto), depois flag do servidor (4), depois texto ASCII
        if (content.length >= 5) {
          const textLen = Math.max(0, content[0] - 4);
          const text = content.subarray(5, 5 + textLen).toString('latin1').replace(/\0+$/g, '').trim();
          result.commandResponse = text;
          result.info = `resposta comando: ${text}`;
        }
        break;
      }

      case MSG_TIME_REQUEST: {
        const d = new Date();
        const body = Buffer.from([
          d.getUTCFullYear() - 2000,
          d.getUTCMonth() + 1,
          d.getUTCDate(),
          d.getUTCHours(),
          d.getUTCMinutes(),
          d.getUTCSeconds(),
        ]);
        result.responses.push(buildGt06Frame(MSG_TIME_REQUEST, body, serial));
        result.info = 'sincronização de horário';
        break;
      }

      case MSG_INFO: {
        if (!imei || content.length < 1) break;
        const sub = content[0];
        const status: DecodedStatus = { imei, protocol: 'gt06', time: now, attributes: {} };
        if (sub === 0x00 && content.length >= 3) {
          status.powerVoltage = content.readUInt16BE(1) / 100;
          result.info = `tensão externa ${status.powerVoltage}V`;
        } else if (sub === 0x04) {
          const text = content.subarray(1).toString('latin1');
          status.attributes!.statusText = text;
          const m = text.match(/ACC=(ON|OFF)/i);
          if (m) status.ignition = m[1].toUpperCase() === 'ON';
          const oil = text.match(/(?:OIL|Defense|DYD)=?(ON|OFF)?/i);
          if (oil && oil[1]) status.blocked = /DYD/i.test(oil[0]) ? oil[1].toUpperCase() === 'ON' : status.blocked;
          result.info = `status: ${text}`;
        } else if (sub === 0x0a) {
          status.attributes!.iccid = content.subarray(1).toString('hex');
          result.info = 'iccid';
        } else {
          result.info = `info 0x${sub.toString(16)}`;
        }
        result.statuses.push(status);
        break;
      }

      case MSG_ADDRESS_REQUEST: {
        result.responses.push(ack(proto, serial));
        break;
      }

      default: {
        result.responses.push(ack(proto, serial));
        result.info = `mensagem 0x${proto.toString(16)} não tratada`;
      }
    }
    return result;
  },

  encodeCommand(command, session) {
    const text = gt06CommandText(command);
    if (!text) return null;
    const ascii = Buffer.from(text, 'latin1');
    const content = Buffer.alloc(1 + 4 + ascii.length + 2);
    content[0] = 4 + ascii.length;
    content.writeUInt32BE(0, 1); // server flag
    ascii.copy(content, 5);
    content.writeUInt16BE(0x0002, 5 + ascii.length); // idioma: inglês
    session.serial = (session.serial + 1) & 0xffff;
    return buildGt06Frame(MSG_COMMAND_0, content, session.serial);
  },
};

export function gt06CommandText(command: DeviceCommand): string | null {
  const payload = (command.payload ?? '').trim();
  switch (command.type) {
    case 'engineStop':
      return payload === 'dyd' ? `DYD,${command.password}#` : 'RELAY,1#';
    case 'engineResume':
      return payload === 'dyd' ? `HFYD,${command.password}#` : 'RELAY,0#';
    case 'positionSingle':
      return 'WHERE#';
    case 'reboot':
      return 'RESET#';
    case 'factoryReset':
      return 'FACTORY#';
    case 'setInterval': {
      const s = Math.max(5, Math.min(3600, Number(payload) || 10));
      return `TIMER,${s},${s}#`;
    }
    case 'custom':
      return payload || null;
    default:
      return null;
  }
}
