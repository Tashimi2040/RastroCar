/** Ilustrações 3D dos veículos (geradas para a identidade RastroCar). */
export const VEHICLE_IMAGES: Record<string, string> = {
  car: '/img/car.webp',
  motorcycle: '/img/motorcycle.webp',
  truck: '/img/truck.webp',
  van: '/img/van.webp',
  bus: '/img/van.webp',
  pickup: '/img/pickup.webp',
  other: '/img/pickup.webp',
};

export function vehicleImage(type: string | null | undefined, model?: string | null): string {
  const m = (model ?? '').toLowerCase();
  if (type === 'car' && /(strada|toro|saveiro|montana|hilux|ranger|s10|amarok|l200|frontier|maverick|oroch|picape|pickup)/.test(m)) return VEHICLE_IMAGES.pickup;
  return VEHICLE_IMAGES[type ?? 'car'] ?? VEHICLE_IMAGES.car;
}

export const TRACKER_IMAGE = '/img/tracker.webp';
export const LOGO_MARK = '/brand/logo-mark.svg';
export const LOGO_WHITE = '/brand/logo-horizontal-white.svg';
export const LOGO_DARK = '/brand/logo-horizontal.svg';
export const HERO = '/brand/hero.svg';
