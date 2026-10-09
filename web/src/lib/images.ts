import { API_BASE } from './api';

/** Assets estáticos podem ser servidos pela API quando o painel está em outro host (ex.: Vercel + Railway). */
const asset = (p: string) => (API_BASE ? `${API_BASE}${p}` : p);

/** Ilustrações 3D dos veículos (geradas para a identidade RastroCar). */
export const VEHICLE_IMAGES: Record<string, string> = {
  car: asset('/img/car.webp'),
  motorcycle: asset('/img/motorcycle.webp'),
  truck: asset('/img/truck.webp'),
  van: asset('/img/van.webp'),
  bus: asset('/img/van.webp'),
  pickup: asset('/img/pickup.webp'),
  other: asset('/img/pickup.webp'),
};

export function vehicleImage(type: string | null | undefined, model?: string | null): string {
  const m = (model ?? '').toLowerCase();
  if (type === 'car' && /(strada|toro|saveiro|montana|hilux|ranger|s10|amarok|l200|frontier|maverick|oroch|picape|pickup)/.test(m)) return VEHICLE_IMAGES.pickup;
  return VEHICLE_IMAGES[type ?? 'car'] ?? VEHICLE_IMAGES.car;
}

export const TRACKER_IMAGE = asset('/img/tracker.webp');
export const LOGO_MARK = '/brand/logo-mark.svg';
export const LOGO_WHITE = '/brand/logo-horizontal-white.svg';
export const LOGO_DARK = '/brand/logo-horizontal.svg';
export const HERO = '/brand/hero.svg';
export const HERO_IMAGE = asset('/img/hero.webp');
