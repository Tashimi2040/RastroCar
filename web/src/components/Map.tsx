import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle, Polygon, useMap, Tooltip } from 'react-leaflet';
import type { Vehicle, Position, Geofence } from '../lib/types';
import { STATE_COLOR, STATE_LABEL, fmtDateTime, fmtSpeed, fmtRelative } from '../lib/format';
import { useSettings } from '../lib/settings';

export function vehicleIcon(v: { state: string; course: number | null; type?: string; blocked?: boolean | null }) {
  const color = STATE_COLOR[v.state] ?? '#64748b';
  const rot = v.state === 'moving' && v.course != null ? v.course : 0;
  const glyph =
    v.type === 'motorcycle'
      ? '<path d="M5 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0zm8 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM8 14l3-6h4l2 3M14 8l-1-3h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : v.type === 'truck'
        ? '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="17" r="2" fill="currentColor"/><circle cx="17" cy="17" r="2" fill="currentColor"/>'
        : v.state === 'moving'
          ? '<path d="M12 3l7 18-7-4-7 4z" fill="currentColor"/>'
          : '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13v5H5z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="15" r="1.5" fill="currentColor"/><circle cx="16" cy="15" r="1.5" fill="currentColor"/>';
  const lock = v.blocked ? '<div style="position:absolute;right:-4px;top:-4px;width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff"></div>' : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative"><div class="vehicle-marker" style="background:${color};transform:rotate(${rot}deg)"><svg viewBox="0 0 24 24">${glyph}</svg></div>${lock}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

export function BaseMap({ children, center, zoom, className, whenReady }: { children?: React.ReactNode; center?: [number, number]; zoom?: number; className?: string; whenReady?: (map: L.Map) => void }) {
  const s = useSettings();
  const c = center ?? [s.map_center_lat, s.map_center_lng];
  return (
    <MapContainer center={c} zoom={zoom ?? s.map_zoom} className={className} zoomControl={true} preferCanvas>
      <TileLayer url={s.map_tile_url} attribution={s.map_attribution} maxZoom={19} />
      {whenReady && <Ready fn={whenReady} />}
      {children}
    </MapContainer>
  );
}

function Ready({ fn }: { fn: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => fn(map), [map, fn]);
  return null;
}

export function FitBounds({ points, deps }: { points: [number, number][]; deps?: unknown[] }) {
  const map = useMap();
  const key = JSON.stringify(deps ?? points.length);
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15));
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function FlyTo({ target, zoom }: { target: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), zoom ?? 15), { duration: 0.6 });
  }, [target?.[0], target?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function VehicleMarker({ v, selected, onClick }: { v: Vehicle; selected?: boolean; onClick?: () => void }) {
  const icon = useMemo(() => vehicleIcon(v), [v.state, v.course, v.type, v.blocked]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<L.Marker>(null);
  useEffect(() => {
    if (selected) ref.current?.openPopup();
  }, [selected]);
  if (v.lat == null || v.lng == null) return null;
  return (
    <Marker position={[v.lat, v.lng]} icon={icon} ref={ref} eventHandlers={{ click: () => onClick?.() }} zIndexOffset={selected ? 1000 : 0}>
      <Tooltip direction="top" offset={[0, -18]} permanent className="vehicle-label" opacity={1}>
        {v.name}
      </Tooltip>
      <Popup>
        <VehiclePopup v={v} />
      </Popup>
    </Marker>
  );
}

export function VehiclePopup({ v }: { v: Vehicle }) {
  return (
    <div>
      <div className="popup-title">
        {v.name} {v.plate && <span className="muted">· {v.plate}</span>}
      </div>
      <div className="popup-grid">
        <span className="k">Status</span>
        <span style={{ color: STATE_COLOR[v.state], fontWeight: 600 }}>{STATE_LABEL[v.state]}</span>
        <span className="k">Velocidade</span>
        <span>{fmtSpeed(v.speed)}</span>
        <span className="k">Ignição</span>
        <span>{v.ignition == null ? '—' : v.ignition ? 'Ligada' : 'Desligada'}</span>
        {v.blocked != null && (
          <>
            <span className="k">Motor</span>
            <span>{v.blocked ? 'Bloqueado' : 'Liberado'}</span>
          </>
        )}
        <span className="k">Última posição</span>
        <span>{fmtDateTime(v.fix_time)}</span>
        <span className="k">Comunicação</span>
        <span>{fmtRelative(v.last_seen_at)}</span>
        {v.battery_level != null && (
          <>
            <span className="k">Bateria</span>
            <span>{v.battery_level}%</span>
          </>
        )}
        {v.power_voltage != null && (
          <>
            <span className="k">Tensão</span>
            <span>{v.power_voltage.toFixed(1)} V</span>
          </>
        )}
        {v.satellites != null && (
          <>
            <span className="k">Satélites</span>
            <span>{v.satellites}</span>
          </>
        )}
        <span className="k">Coordenadas</span>
        <span className="mono">
          {v.lat?.toFixed(5)}, {v.lng?.toFixed(5)}
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">
          Abrir no Google Maps ↗
        </a>
      </div>
    </div>
  );
}

/** Rota (polilinha) colorida por velocidade + marcadores de início/fim. */
export function RouteLayer({ points, color, showStartEnd = true, speedColors = true }: { points: Position[]; color?: string; showStartEnd?: boolean; speedColors?: boolean }) {
  const segments = useMemo(() => {
    if (!speedColors) return [{ color: color ?? '#2563eb', latlngs: points.map((p) => [p.lat, p.lng] as [number, number]) }];
    const out: { color: string; latlngs: [number, number][] }[] = [];
    let cur: { color: string; latlngs: [number, number][] } | null = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const c = p.speed >= 80 ? '#dc2626' : p.speed >= 50 ? '#f59e0b' : p.speed >= 5 ? '#2563eb' : '#64748b';
      if (!cur || cur.color !== c) {
        const prev: [number, number] | null = cur ? cur.latlngs[cur.latlngs.length - 1] : null;
        cur = { color: c, latlngs: prev ? [prev] : [] };
        out.push(cur);
      }
      cur.latlngs.push([p.lat, p.lng]);
    }
    return out;
  }, [points, color, speedColors]);
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <>
      {segments.map((s, i) => (
        <Polyline key={i} positions={s.latlngs} pathOptions={{ color: s.color, weight: 4, opacity: 0.85 }} />
      ))}
      {showStartEnd && (
        <>
          <CircleMarker center={[first.lat, first.lng]} radius={8} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Início · {fmtDateTime(first.fix_time)}</Tooltip>
          </CircleMarker>
          <CircleMarker center={[last.lat, last.lng]} radius={8} pathOptions={{ color: '#fff', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Fim · {fmtDateTime(last.fix_time)}</Tooltip>
          </CircleMarker>
        </>
      )}
    </>
  );
}

export function GeofenceLayer({ fences, onClick }: { fences: Geofence[]; onClick?: (g: Geofence) => void }) {
  return (
    <>
      {fences.map((g) =>
        g.geometry.type === 'circle' ? (
          <Circle key={g.id} center={[g.geometry.center.lat, g.geometry.center.lng]} radius={g.geometry.radius} pathOptions={{ color: g.color, fillOpacity: 0.12, weight: 2, dashArray: g.active ? undefined : '4 4' }} eventHandlers={{ click: () => onClick?.(g) }}>
            <Tooltip>{g.name}</Tooltip>
          </Circle>
        ) : (
          <Polygon key={g.id} positions={g.geometry.points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: g.color, fillOpacity: 0.12, weight: 2, dashArray: g.active ? undefined : '4 4' }} eventHandlers={{ click: () => onClick?.(g) }}>
            <Tooltip>{g.name}</Tooltip>
          </Polygon>
        ),
      )}
    </>
  );
}
