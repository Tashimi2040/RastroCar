/** CRC-16/X-25 (CRC-ITU) usado pelo protocolo GT06 / Concox. */
export function crc16itu(buf: Buffer | Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
  }
  return ~crc & 0xffff;
}
