import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface PublicSettings {
  company_name: string;
  map_tile_url: string;
  map_attribution: string;
  map_center_lat: number;
  map_center_lng: number;
  map_zoom: number;
}

const DEFAULTS: PublicSettings = {
  company_name: 'RastroCar',
  map_tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  map_attribution: '&copy; OpenStreetMap contributors',
  map_center_lat: -23.55052,
  map_center_lng: -46.633308,
  map_zoom: 11,
};

const Ctx = createContext<{ settings: PublicSettings; reload: () => void }>({ settings: DEFAULTS, reload: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULTS);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api.get<PublicSettings>('/api/settings/public').then((s) => setSettings({ ...DEFAULTS, ...s })).catch(() => {});
  }, [tick]);
  return <Ctx.Provider value={{ settings, reload: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>;
}

export function useSettings(): PublicSettings {
  return useContext(Ctx).settings;
}

export function useReloadSettings() {
  return useContext(Ctx).reload;
}
