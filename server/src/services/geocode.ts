import { getDb } from '../db/index.js';
import { getSettings } from './settings.js';

/**
 * Geocodificação reversa via Nominatim (OpenStreetMap), com cache local e
 * fila com limite de 1 requisição/segundo (política de uso do serviço).
 */
const queue: { lat: number; lng: number; resolve: (v: string | null) => void }[] = [];
let running = false;
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function getCachedAddress(lat: number, lng: number): string | null {
  const row = getDb().get<{ address: string }>('SELECT address FROM geocode_cache WHERE key = ?', cacheKey(lat, lng));
  return row?.address ?? null;
}

export function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!getSettings().reverse_geocode) return Promise.resolve(null);
  const key = cacheKey(lat, lng);
  const cached = getCachedAddress(lat, lng);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = new Promise<string | null>((resolve) => {
    queue.push({ lat, lng, resolve });
    void pump();
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const item = queue.shift()!;
    let address: string | null = null;
    try {
      address = await fetchNominatim(item.lat, item.lng);
      if (address) {
        getDb().run(
          'INSERT OR REPLACE INTO geocode_cache (key, address, created_at) VALUES (?, ?, ?)',
          cacheKey(item.lat, item.lng),
          address,
          Date.now(),
        );
      }
    } catch {
      address = null;
    }
    item.resolve(address);
    await new Promise((r) => setTimeout(r, 1100));
  }
  running = false;
}

async function fetchNominatim(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=pt-BR`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RastroCar/1.0 (plataforma de rastreamento)' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const a = json.address;
    if (a) {
      const street = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
      const number = a.house_number ? `, ${a.house_number}` : '';
      const district = a.suburb ?? a.neighbourhood ?? a.village ?? '';
      const city = a.city ?? a.town ?? a.municipality ?? a.county ?? '';
      const state = a.state ?? '';
      const parts = [street ? `${street}${number}` : '', district, city && state ? `${city} - ${state}` : city || state].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    return json.display_name ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
