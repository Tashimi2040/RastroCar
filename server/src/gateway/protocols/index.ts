import type { ProtocolHandler, ProtocolName } from '../types.js';
import { gt06 } from './gt06.js';
import { h02 } from './h02.js';
import { tk103 } from './tk103.js';

export const protocols: ProtocolHandler[] = [gt06, h02, tk103];

export function getProtocol(name: ProtocolName): ProtocolHandler {
  const p = protocols.find((x) => x.name === name);
  if (!p) throw new Error(`Protocolo desconhecido: ${name}`);
  return p;
}

export function detectProtocol(buffer: Buffer): ProtocolHandler | null {
  for (const p of protocols) if (p.detect(buffer)) return p;
  return null;
}
