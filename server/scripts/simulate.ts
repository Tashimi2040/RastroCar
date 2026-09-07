/**
 * Simulador de rastreador GT06 — envia login, heartbeat e uma rota real
 * ao gateway TCP para testar a plataforma sem hardware.
 *
 * Uso: npm run simulate -- [host] [porta] [imei] [protocolo: gt06|h02|tk103] [intervalo_s]
 */
import net from 'node:net';
import { buildGt06Frame } from '../src/gateway/protocols/gt06.js';

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 5023);
const imei = process.argv[4] ?? '868120212345678';
const protocol = (process.argv[5] ?? 'gt06') as 'gt06' | 'h02' | 'tk103';
const intervalS = Number(process.argv[6] ?? 5);

// Rota aproximada: Av. Paulista -> Ibirapuera (São Paulo)
const route: [number, number][] = [
  [-23.5614, -46.6559], [-23.5623, -46.6541], [-23.5635, -46.6522], [-23.5648, -46.6503], [-23.5661, -46.6486],
  [-23.5676, -46.6470], [-23.5692, -46.6458], [-23.5710, -46.6449], [-23.5730, -46.6443], [-23.5751, -46.6440],
  [-23.5772, -46.6445], [-23.5790, -46.6458], [-23.5806, -46.6476], [-23.5818, -46.6498], [-23.5827, -46.6523],
  [-23.5833, -46.6550], [-23.5838, -46.6578], [-23.5845, -46.6605], [-23.5855, -46.6630], [-23.5868, -46.6652],
];

function bcd(str: string): Buffer {
  const padded = str.length % 2 ? '0' + str : str;
  return Buffer.from(padded, 'hex');
}

function gt06Login(): Buffer {
  return buildGt06Frame(0x01, Buffer.concat([bcd(imei), Buffer.from([0x36, 0x08, 0x00, 0x00])]), 1);
}

function gt06Heartbeat(ignition: boolean, serial: number): Buffer {
  return buildGt06Frame(0x13, Buffer.from([ignition ? 0x42 : 0x40, 5, 4, 0x00, 0x02]), serial);
}

function gt06Position(lat: number, lng: number, speed: number, course: number, ignition: boolean, serial: number): Buffer {
  const d = new Date();
  const content = Buffer.alloc(6 + 12 + 8 + 3);
  content.set([d.getUTCFullYear() - 2000, d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()], 0);
  content[6] = 0xcb;
  content.writeUInt32BE(Math.round(Math.abs(lat) * 1800000), 7);
  content.writeUInt32BE(Math.round(Math.abs(lng) * 1800000), 11);
  content[15] = Math.min(255, Math.round(speed));
  let cs = 0x1000 | (course & 0x3ff);
  if (lat >= 0) cs |= 0x0400;
  if (lng < 0) cs |= 0x0800;
  content.writeUInt16BE(cs, 16);
  content.writeUInt16BE(724, 18);
  content[20] = 5;
  content.writeUInt16BE(1234, 21);
  content.writeUIntBE(5678, 23, 3);
  content[26] = ignition ? 1 : 0;
  content[27] = 0;
  content[28] = 0;
  return buildGt06Frame(0x22, content, serial);
}

function nmea(v: number, width: number): string {
  const abs = Math.abs(v);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${String(deg).padStart(width, '0')}${min.toFixed(4).padStart(7, '0')}`;
}

function h02Position(lat: number, lng: number, speed: number, course: number, ignition: boolean): Buffer {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const date = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  const status = ignition ? 'FFFFFFFF' : 'FFFFFBFF';
  return Buffer.from(`*HQ,${imei},V1,${time},A,${nmea(lat, 2)},${lat < 0 ? 'S' : 'N'},${nmea(lng, 3)},${lng < 0 ? 'W' : 'E'},${(speed / 1.852).toFixed(2)},${course},${date},${status},724,05,1234,5678#`);
}

function tk103Position(lat: number, lng: number, speed: number, course: number, ignition: boolean): Buffer {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  const time = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000`;
  return Buffer.from(`imei:${imei},${ignition ? 'tracker' : 'acc off'},${date},,F,${time},A,${nmea(lat, 2)},${lat < 0 ? 'S' : 'N'},${nmea(lng, 3)},${lng < 0 ? 'W' : 'E'},${(speed / 1.852).toFixed(2)},${course};`);
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const socket = net.createConnection({ host, port }, () => {
  console.log(`conectado a ${host}:${port} como ${imei} (${protocol})`);
  let serial = 2;
  if (protocol === 'gt06') socket.write(gt06Login());
  else if (protocol === 'tk103') socket.write(Buffer.from(`##,imei:${imei},A;`));

  // Percorre a rota com velocidade realista, interpolando entre os pontos.
  let seg = 0; // índice do segmento atual
  let frac = 0; // progresso dentro do segmento (0..1)
  let direction = 1;
  let pauseTicks = 0;
  let speed = 0;
  let tickCount = 0;

  const tick = () => {
    tickCount++;
    let a = route[seg];
    let b = route[seg + 1];
    let lat = a[0] + (b[0] - a[0]) * frac;
    let lng = a[1] + (b[1] - a[1]) * frac;
    let ignition = true;

    if (pauseTicks > 0) {
      pauseTicks--;
      speed = 0;
      ignition = pauseTicks > 2; // desliga ignição no fim da parada
    } else {
      speed = Math.max(15, Math.min(80, speed + (Math.random() - 0.45) * 15));
      // avança distância = velocidade * intervalo
      let remaining = (speed / 3.6) * intervalS;
      while (remaining > 0) {
        a = route[seg];
        b = route[seg + 1];
        const segLen = haversine(a, b);
        const left = segLen * (direction === 1 ? 1 - frac : frac);
        if (remaining < left) {
          frac += (direction * remaining) / segLen;
          remaining = 0;
        } else {
          remaining -= left;
          seg += direction;
          frac = direction === 1 ? 0 : 1;
          if (seg >= route.length - 1 || seg < 0) {
            seg = Math.max(0, Math.min(route.length - 2, seg));
            frac = direction === 1 ? 1 : 0;
            direction *= -1;
            pauseTicks = Math.max(3, Math.round(240 / intervalS)); // ~4 min parado
            remaining = 0;
          }
        }
      }
      lat = route[seg][0] + (route[seg + 1][0] - route[seg][0]) * frac;
      lng = route[seg][1] + (route[seg + 1][1] - route[seg][1]) * frac;
    }
    const next = direction === 1 ? route[seg + 1] : route[seg];
    const course = Math.round((Math.atan2((next[1] - lng) * Math.cos((lat * Math.PI) / 180), next[0] - lat) * 180) / Math.PI + 360) % 360;

    const spd = Math.round(speed);
    const frame = protocol === 'gt06' ? gt06Position(lat, lng, spd, course, ignition, serial++) : protocol === 'h02' ? h02Position(lat, lng, spd, course, ignition) : tk103Position(lat, lng, spd, course, ignition);
    socket.write(frame);
    console.log(`${new Date().toLocaleTimeString()} pos ${lat.toFixed(5)},${lng.toFixed(5)} ${spd} km/h ign=${ignition}${pauseTicks ? ' (parado)' : ''}`);
    if (protocol === 'gt06' && tickCount % 6 === 0) socket.write(gt06Heartbeat(ignition, serial++));
  };
  tick();
  setInterval(tick, intervalS * 1000);
});
socket.on('data', (d) => console.log('  << servidor:', d.toString('hex')));
socket.on('error', (e) => {
  console.error('erro:', e.message);
  process.exit(1);
});
socket.on('close', () => {
  console.log('conexão encerrada');
  process.exit(0);
});
