import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Marker, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, Route, MapPin, Clock, Gauge, ParkingCircle, Download } from 'lucide-react';
import { api } from '../lib/api';
import type { Vehicle, Trip, Stop, Position } from '../lib/types';
import { BaseMap, RouteLayer, FitBounds, vehicleIcon } from '../components/Map';
import { Loading, Empty, useToast } from '../components/ui';
import { dayjs, fmtDateTime, fmtDistance, fmtDuration, fmtSpeed, fmtTime, toInputDateTime } from '../lib/format';

type Tab = 'trips' | 'stops' | 'all';

export function History() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<number>(Number(params.get('vehicleId')) || 0);
  const [from, setFrom] = useState(toInputDateTime(dayjs().startOf('day').valueOf()));
  const [to, setTo] = useState(toInputDateTime(dayjs().endOf('day').valueOf()));
  const [tab, setTab] = useState<Tab>('trips');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [route, setRoute] = useState<Position[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripPoints, setTripPoints] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [speedFactor, setSpeedFactor] = useState(4);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.get<Vehicle[]>('/api/vehicles').then((v) => {
      setVehicles(v);
      if (!vehicleId && v.length) setVehicleId(v[0].id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setSelectedTrip(null);
    setTripPoints([]);
    setPlaying(false);
    setParams({ vehicleId: String(vehicleId) });
    const q = { vehicleId, from: dayjs(from).toISOString(), to: dayjs(to).toISOString() };
    try {
      const [t, s, r] = await Promise.all([api.get<Trip[]>('/api/trips', q), api.get<Stop[]>('/api/stops', q), api.get<Position[]>('/api/positions', { ...q, simplify: 8 })]);
      setTrips(t);
      setStops(s);
      setRoute(r);
      if (!t.length && !r.length) toast('info', 'Nenhum registro no período selecionado');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vehicleId) load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTrip = async (t: Trip) => {
    setSelectedTrip(t);
    setPlaying(false);
    setPlayIdx(0);
    try {
      const d = await api.get<Trip & { points: Position[] }>(`/api/trips/${t.id}`);
      setTripPoints(d.points);
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  const shown = selectedTrip ? tripPoints : route;

  // Playback
  useEffect(() => {
    if (!playing) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      setPlayIdx((i) => {
        if (i >= shown.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(40, 600 / speedFactor));
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, speedFactor, shown.length]);

  const playPoint = shown[playIdx];
  const bounds = useMemo(() => shown.map((p) => [p.lat, p.lng] as [number, number]), [shown]);
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const exportCsv = () => {
    const rows = [['data_hora', 'latitude', 'longitude', 'velocidade_kmh', 'ignicao'], ...shown.map((p) => [fmtDateTime(p.fix_time), p.lat, p.lng, p.speed, p.ignition == null ? '' : p.ignition ? 'ligada' : 'desligada'])];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rota-${vehicle?.plate ?? vehicle?.name ?? vehicleId}-${dayjs(from).format('YYYYMMDD')}.csv`;
    a.click();
  };

  const timeline = useMemo(() => {
    const items: { kind: 'trip' | 'stop'; time: number; data: Trip | Stop }[] = [
      ...trips.map((t) => ({ kind: 'trip' as const, time: t.start_time, data: t })),
      ...stops.map((s) => ({ kind: 'stop' as const, time: s.start_time, data: s })),
    ];
    return items.sort((a, b) => b.time - a.time);
  }, [trips, stops]);

  const totals = useMemo(() => ({ distance: trips.reduce((a, t) => a + t.distance_m, 0), duration: trips.reduce((a, t) => a + t.duration_s, 0), max: trips.reduce((a, t) => Math.max(a, t.max_speed), 0) }), [trips]);

  return (
    <div className="map-page">
      <aside className="map-side" style={{ width: 380 }}>
        <div className="side-header stack" style={{ gap: 8 }}>
          <select className="select" value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}>
            {!vehicles.length && <option value={0}>Nenhum veículo</option>}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.plate ? `· ${v.plate}` : ''}
              </option>
            ))}
          </select>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 6 }}>
            {[
              ['Hoje', 0],
              ['Ontem', 1],
              ['7 dias', 7],
            ].map(([label, d]) => (
              <button
                key={label}
                className="btn sm"
                onClick={() => {
                  const n = Number(d);
                  if (n === 1) {
                    setFrom(toInputDateTime(dayjs().subtract(1, 'day').startOf('day').valueOf()));
                    setTo(toInputDateTime(dayjs().subtract(1, 'day').endOf('day').valueOf()));
                  } else {
                    setFrom(toInputDateTime(dayjs().subtract(n, 'day').startOf('day').valueOf()));
                    setTo(toInputDateTime(dayjs().endOf('day').valueOf()));
                  }
                }}
              >
                {label}
              </button>
            ))}
            <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={load} disabled={loading || !vehicleId}>
              Buscar
            </button>
          </div>
          {trips.length > 0 && (
            <div className="row small muted" style={{ gap: 12 }}>
              <span>
                <Route size={13} /> {trips.length} viagem(ns)
              </span>
              <span>
                <MapPin size={13} /> {fmtDistance(totals.distance)}
              </span>
              <span>
                <Clock size={13} /> {fmtDuration(totals.duration)}
              </span>
              <span>
                <Gauge size={13} /> {fmtSpeed(totals.max)}
              </span>
            </div>
          )}
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${tab === 'trips' ? 'active' : ''}`} onClick={() => setTab('trips')}>Viagens</button>
            <button className={`tab ${tab === 'stops' ? 'active' : ''}`} onClick={() => setTab('stops')}>Paradas</button>
            <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>Linha do tempo</button>
          </div>
        </div>
        <div className="side-list">
          {loading ? (
            <Loading />
          ) : tab === 'trips' ? (
            !trips.length ? (
              <Empty text="Nenhuma viagem no período" icon={<Route size={34} />} />
            ) : (
              trips.map((t) => <TripItem key={t.id} t={t} selected={selectedTrip?.id === t.id} onClick={() => openTrip(t)} />)
            )
          ) : tab === 'stops' ? (
            !stops.length ? (
              <Empty text="Nenhuma parada no período" icon={<ParkingCircle size={34} />} />
            ) : (
              stops.map((s) => <StopItem key={s.id} s={s} />)
            )
          ) : (
            <div className="timeline" style={{ padding: '10px 14px 10px 30px' }}>
              {!timeline.length && <Empty text="Sem registros" />}
              {timeline.map((i) =>
                i.kind === 'trip' ? (
                  <div key={`t${(i.data as Trip).id}`} className="t-item" style={{ cursor: 'pointer' }} onClick={() => openTrip(i.data as Trip)}>
                    <div className="strong">
                      {fmtTime((i.data as Trip).start_time)} → {fmtTime((i.data as Trip).end_time)} · {fmtDistance((i.data as Trip).distance_m)}
                    </div>
                    <div className="tiny muted truncate">{(i.data as Trip).start_address ?? 'Viagem'} → {(i.data as Trip).end_address ?? (i.data as Trip).status === 'open' ? 'em andamento' : ''}</div>
                  </div>
                ) : (
                  <div key={`s${(i.data as Stop).id}`} className="t-item stop">
                    <div className="strong">
                      Parado {fmtDuration((i.data as Stop).duration_s)} · {fmtTime((i.data as Stop).start_time)}
                    </div>
                    <div className="tiny muted truncate">{(i.data as Stop).address ?? `${(i.data as Stop).lat.toFixed(5)}, ${(i.data as Stop).lng.toFixed(5)}`}</div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
        {selectedTrip && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }} className="row between">
            <span className="small">
              Viagem selecionada · {fmtDistance(selectedTrip.distance_m)} · {fmtDuration(selectedTrip.duration_s)}
            </span>
            <button className="btn sm" onClick={() => { setSelectedTrip(null); setTripPoints([]); setPlaying(false); }}>
              Ver período todo
            </button>
          </div>
        )}
      </aside>
      <div className="map-area">
        <BaseMap>
          {bounds.length > 0 && <FitBounds points={bounds} deps={[selectedTrip?.id, route.length]} />}
          <RouteLayer points={shown} />
          {stops
            .filter((s) => !selectedTrip)
            .map((s) => (
              <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2 }}>
                <Tooltip>
                  Parada {fmtDuration(s.duration_s)} · {fmtTime(s.start_time)}
                  {s.address ? ` · ${s.address}` : ''}
                </Tooltip>
              </CircleMarker>
            ))}
          {playPoint && (playing || playIdx > 0) && (
            <Marker position={[playPoint.lat, playPoint.lng]} icon={vehicleIcon({ state: playPoint.speed >= 5 ? 'moving' : 'stopped', course: playPoint.course, type: vehicle?.type })} zIndexOffset={2000}>
              <Tooltip permanent direction="top" offset={[0, -18]} className="vehicle-label">
                {fmtTime(playPoint.fix_time)} · {fmtSpeed(playPoint.speed)}
              </Tooltip>
            </Marker>
          )}
        </BaseMap>
        {shown.length > 1 && (
          <div className="map-overlay bottom playback">
            <button className="btn icon primary" onClick={() => { if (playIdx >= shown.length - 1) setPlayIdx(0); setPlaying(!playing); }}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input type="range" min={0} max={shown.length - 1} value={playIdx} onChange={(e) => setPlayIdx(Number(e.target.value))} />
            <span className="small mono" style={{ minWidth: 150 }}>
              {playPoint ? `${fmtDateTime(playPoint.fix_time)} · ${fmtSpeed(playPoint.speed)}` : ''}
            </span>
            <select className="select" style={{ width: 80 }} value={speedFactor} onChange={(e) => setSpeedFactor(Number(e.target.value))}>
              {[1, 2, 4, 8, 16].map((f) => (
                <option key={f} value={f}>{f}x</option>
              ))}
            </select>
            <button className="btn icon" title="Exportar CSV" onClick={exportCsv}>
              <Download size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TripItem({ t, selected, onClick }: { t: Trip; selected: boolean; onClick: () => void }) {
  return (
    <div className={`vehicle-item ${selected ? 'selected' : ''}`} onClick={onClick} style={{ alignItems: 'flex-start' }}>
      <div className="v-icon" style={{ background: t.status === 'open' ? '#16a34a' : '#2563eb' }}>
        <Route size={18} />
      </div>
      <div className="v-main">
        <div className="v-name">
          {fmtTime(t.start_time)} → {t.status === 'open' ? 'em andamento' : fmtTime(t.end_time)}
          <span className="badge neutral" style={{ marginLeft: 'auto' }}>{fmtDistance(t.distance_m)}</span>
        </div>
        <div className="tiny muted truncate" title={t.start_address ?? ''}>
          <span style={{ color: '#16a34a' }}>●</span> {t.start_address ?? `${t.start_lat.toFixed(5)}, ${t.start_lng.toFixed(5)}`}
        </div>
        {t.end_lat != null && (
          <div className="tiny muted truncate" title={t.end_address ?? ''}>
            <span style={{ color: '#dc2626' }}>●</span> {t.end_address ?? `${t.end_lat.toFixed(5)}, ${t.end_lng!.toFixed(5)}`}
          </div>
        )}
        <div className="v-sub" style={{ marginTop: 2 }}>
          <span>{fmtDuration(t.duration_s)}</span>
          <span>máx {fmtSpeed(t.max_speed)}</span>
          <span>média {fmtSpeed(t.avg_speed)}</span>
        </div>
      </div>
    </div>
  );
}

function StopItem({ s }: { s: Stop }) {
  return (
    <div className="vehicle-item" style={{ alignItems: 'flex-start', cursor: 'default' }}>
      <div className="v-icon" style={{ background: '#f59e0b' }}>
        <ParkingCircle size={18} />
      </div>
      <div className="v-main">
        <div className="v-name">
          {fmtTime(s.start_time)} → {s.end_time ? fmtTime(s.end_time) : 'agora'}
          <span className="badge neutral" style={{ marginLeft: 'auto' }}>{fmtDuration(s.duration_s)}</span>
        </div>
        <div className="tiny muted">{s.address ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</div>
        <div className="tiny muted">{fmtDateTime(s.start_time)}</div>
      </div>
    </div>
  );
}

// Evita "unused import" quando L é usado apenas em tipos
void L;
