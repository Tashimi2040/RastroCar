import { useEffect, useState } from 'react';

export interface MapStyle {
  id: string;
  label: string;
  short: string;
  layers: { url: string; attribution: string; subdomains?: string[]; maxZoom?: number }[];
  note?: string;
}

/**
 * Estilos de mapa. O padrão "Ruas" (CARTO Voyager) é gratuito e visualmente
 * muito próximo do Google Maps: ruas, nomes, bairros, pontos de interesse.
 */
export const MAP_STYLES: MapStyle[] = [
  {
    id: 'ruas',
    label: 'Ruas',
    short: 'Ruas',
    layers: [{ url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>', subdomains: ['a', 'b', 'c', 'd'], maxZoom: 20 }],
  },
  {
    id: 'satelite',
    label: 'Satélite com ruas',
    short: 'Satélite',
    layers: [
      { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
      { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', attribution: '', subdomains: ['a', 'b', 'c', 'd'], maxZoom: 20 },
    ],
  },
  {
    id: 'google',
    label: 'Google Maps (ruas)',
    short: 'Google',
    layers: [{ url: 'https://mt{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}', attribution: '&copy; Google', subdomains: ['0', '1', '2', '3'], maxZoom: 20 }],
    note: 'Tiles diretos do Google (uso não oficial). Para uso comercial contínuo, prefira "Ruas" ou uma chave Google Maps Platform.',
  },
  {
    id: 'google-hibrido',
    label: 'Google Maps (satélite híbrido)',
    short: 'G. Satélite',
    layers: [{ url: 'https://mt{s}.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}', attribution: '&copy; Google', subdomains: ['0', '1', '2', '3'], maxZoom: 20 }],
    note: 'Tiles diretos do Google (uso não oficial).',
  },
];

const KEY = 'rastrocar.mapStyle';
const listeners = new Set<(id: string) => void>();

export function getMapStyleId(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && MAP_STYLES.some((s) => s.id === v)) return v;
  } catch {
    /* ignore */
  }
  return 'ruas';
}

export function setMapStyleId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(id);
}

export function useMapStyle(): [MapStyle, (id: string) => void] {
  const [id, setId] = useState(getMapStyleId());
  useEffect(() => {
    listeners.add(setId);
    return () => {
      listeners.delete(setId);
    };
  }, []);
  return [MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0], setMapStyleId];
}
