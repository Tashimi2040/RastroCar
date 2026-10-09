export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo inicial em graus (0-360) de a para b. */
export function bearing(a: LatLng, b: LatLng): number {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Ray casting: ponto dentro de polígono. */
export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export type GeofenceGeometry =
  | { type: 'circle'; center: LatLng; radius: number }
  | { type: 'polygon'; points: LatLng[] };

export function pointInGeofence(p: LatLng, geometry: GeofenceGeometry): boolean {
  if (geometry.type === 'circle') return haversine(p, geometry.center) <= geometry.radius;
  if (geometry.type === 'polygon') return geometry.points.length >= 3 && pointInPolygon(p, geometry.points);
  return false;
}

/** Converte nós para km/h. */
export function knotsToKmh(knots: number): number {
  return knots * 1.852;
}

/** Converte NMEA (DDMM.MMMM) para graus decimais. */
export function nmeaToDecimal(value: string, hemisphere: string): number {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return NaN;
  const degrees = Math.floor(num / 100);
  const minutes = num - degrees * 100;
  let dec = degrees + minutes / 60;
  if (hemisphere === 'S' || hemisphere === 'W') dec = -dec;
  return dec;
}

/** Simplificação de rota (Douglas-Peucker) com tolerância em metros. */
export function simplifyRoute<T extends LatLng>(points: T[], toleranceM: number): T[] {
  if (points.length <= 2) return points;
  const sqTol = toleranceM * toleranceM;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceSq(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > sqTol && idx > 0) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function perpendicularDistanceSq(p: LatLng, a: LatLng, b: LatLng): number {
  // Projeção equiretangular local (suficiente para tolerâncias pequenas)
  const kx = 111320 * Math.cos(toRad(p.lat));
  const ky = 110574;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return px * px + py * py;
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - t * bx;
  const dy = py - t * by;
  return dx * dx + dy * dy;
}
