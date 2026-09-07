import type { Socket } from 'node:net';

export type ProtocolName = 'gt06' | 'h02' | 'tk103';

/** Alarme normalizado (independente de protocolo). */
export type AlarmType =
  | 'sos'
  | 'powerCut'
  | 'powerRestored'
  | 'vibration'
  | 'lowBattery'
  | 'lowPower'
  | 'overspeed'
  | 'geofenceEnter'
  | 'geofenceExit'
  | 'movement'
  | 'tamper'
  | 'door'
  | 'powerOn'
  | 'powerOff'
  | 'gpsAntennaCut'
  | 'accOn'
  | 'accOff'
  | 'jamming'
  | 'accident'
  | 'general';

export interface DecodedPosition {
  imei: string;
  protocol: ProtocolName;
  /** Horário do fix em ms (UTC). */
  fixTime: number;
  valid: boolean;
  lat: number;
  lng: number;
  speed: number; // km/h
  course?: number;
  altitude?: number;
  satellites?: number;
  ignition?: boolean;
  batteryLevel?: number; // 0-100
  powerVoltage?: number; // volts
  gsmSignal?: number; // 0-100
  odometerM?: number;
  alarm?: AlarmType;
  /** Motor bloqueado (relé/corte de combustível ativo). */
  blocked?: boolean;
  attributes?: Record<string, unknown>;
  raw?: string;
}

/** Status reportado sem posição (ex.: heartbeat GT06). */
export interface DecodedStatus {
  imei: string;
  protocol: ProtocolName;
  time: number;
  ignition?: boolean;
  batteryLevel?: number;
  powerVoltage?: number;
  gsmSignal?: number;
  charging?: boolean;
  blocked?: boolean;
  alarm?: AlarmType;
  attributes?: Record<string, unknown>;
}

export interface DecodeResult {
  /** IMEI identificado num pacote de login. */
  login?: string;
  positions: DecodedPosition[];
  statuses: DecodedStatus[];
  /** Bytes a devolver ao rastreador (ACKs). */
  responses: Buffer[];
  /** Resposta textual a um comando enviado anteriormente. */
  commandResponse?: string;
  /** Descrição curta para log. */
  info?: string;
}

export type CommandType = 'engineStop' | 'engineResume' | 'positionSingle' | 'reboot' | 'factoryReset' | 'setInterval' | 'custom';

export interface DeviceCommand {
  id: number;
  type: CommandType;
  payload?: string | null;
  password: string;
}

export interface Session {
  id: number;
  socket: Socket;
  remoteAddress: string;
  protocol?: ProtocolName;
  imei?: string;
  buffer: Buffer;
  serial: number;
  connectedAt: number;
  lastActivity: number;
  /** Estado por protocolo (ex.: último ACC conhecido). */
  state: Record<string, unknown>;
}

export interface ProtocolHandler {
  readonly name: ProtocolName;
  /** Verifica se os primeiros bytes pertencem a este protocolo. */
  detect(buffer: Buffer): boolean;
  /**
   * Retorna o tamanho do primeiro frame completo no buffer.
   * 0 = incompleto (aguardar mais dados); -1 = dado inválido (descartar 1 byte).
   */
  frameLength(buffer: Buffer): number;
  decode(frame: Buffer, session: Session): DecodeResult;
  /** Codifica um comando para envio. Retorna null se o comando não for suportado. */
  encodeCommand(command: DeviceCommand, session: Session): Buffer | null;
}

export function emptyResult(): DecodeResult {
  return { positions: [], statuses: [], responses: [] };
}
