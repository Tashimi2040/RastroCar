import { useEffect, useState } from 'react';
import { Bell, CheckCheck, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import type { EventRow, Vehicle } from '../lib/types';
import { Badge, Empty, Loading, Modal, useToast } from '../components/ui';
import { dayjs, fmtDateTime, EVENT_TYPES, toInputDateTime } from '../lib/format';
import { useRealtime } from '../lib/realtime';
import { BaseMap } from '../components/Map';
import { CircleMarker } from 'react-leaflet';

export function Events() {
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(0);
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [from, setFrom] = useState(toInputDateTime(dayjs().subtract(6, 'day').startOf('day').valueOf()));
  const [to, setTo] = useState(toInputDateTime(dayjs().endOf('day').valueOf()));
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapEv, setMapEv] = useState<EventRow | null>(null);

  useEffect(() => {
    api.get<Vehicle[]>('/api/vehicles').then(setVehicles);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setEvents(await api.get<EventRow[]>('/api/events', { vehicleId: vehicleId || undefined, severity: severity || undefined, type: type || undefined, unacknowledged: onlyOpen ? 1 : undefined, from: dayjs(from).toISOString(), to: dayjs(to).toISOString() }));
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [vehicleId, severity, type, onlyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtime((m) => {
    if (m.type === 'event' && (!vehicleId || m.data.vehicle_id === vehicleId)) setEvents((e) => [m.data, ...e]);
  });

  const ack = async (id: number) => {
    await api.post(`/api/events/${id}/ack`);
    setEvents((e) => e.map((x) => (x.id === id ? { ...x, acknowledged: 1 } : x)));
  };
  const ackAll = async () => {
    const r = await api.post<{ count: number }>('/api/events/ack-all');
    toast('success', `${r.count} alerta(s) marcados como lidos`);
    load();
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-body row" style={{ gap: 10 }}>
          <select className="select" style={{ width: 220 }} value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}>
            <option value={0}>Todos os veículos</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select className="select" style={{ width: 150 }} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Todas severidades</option>
            <option value="critical">Crítico</option>
            <option value="warning">Atenção</option>
            <option value="info">Informativo</option>
          </select>
          <select className="select" style={{ width: 200 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" style={{ width: 190 }} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" style={{ width: 190 }} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <label className="checkbox">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Só não lidos
          </label>
          <button className="btn primary" onClick={load}>Filtrar</button>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={ackAll}>
            <CheckCheck size={15} /> Marcar todos como lidos
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-body tight">
          {loading ? (
            <Loading />
          ) : !events.length ? (
            <Empty text="Nenhum alerta no período" icon={<Bell size={34} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Severidade</th>
                    <th>Evento</th>
                    <th>Veículo</th>
                    <th>Detalhes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} style={{ opacity: e.acknowledged ? 0.6 : 1 }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.event_time)}</td>
                      <td>
                        <Badge tone={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'info'}>{e.severity === 'critical' ? 'Crítico' : e.severity === 'warning' ? 'Atenção' : 'Info'}</Badge>
                      </td>
                      <td className="strong">{e.title}</td>
                      <td>
                        {e.vehicle_name ?? <span className="muted">{e.imei}</span>}
                        {e.client_name && <div className="tiny muted">{e.client_name}</div>}
                      </td>
                      <td className="small muted">{e.message}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {e.lat != null && (
                          <button className="btn sm ghost" onClick={() => setMapEv(e)} title="Ver no mapa">
                            <MapPin size={15} />
                          </button>
                        )}
                        {!e.acknowledged && (
                          <button className="btn sm" onClick={() => ack(e.id)}>
                            Lido
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {mapEv && mapEv.lat != null && (
        <Modal title={mapEv.title} onClose={() => setMapEv(null)} size="lg">
          <div className="small muted mb">
            {mapEv.vehicle_name} · {fmtDateTime(mapEv.event_time)} · {mapEv.message}
          </div>
          <div style={{ height: 420, borderRadius: 10, overflow: 'hidden' }}>
            <BaseMap center={[mapEv.lat, mapEv.lng!]} zoom={16}>
              <CircleMarker center={[mapEv.lat, mapEv.lng!]} radius={10} pathOptions={{ color: '#fff', fillColor: mapEv.severity === 'critical' ? '#dc2626' : '#f59e0b', fillOpacity: 1, weight: 2 }} />
            </BaseMap>
          </div>
          <div className="mt">
            <a href={`https://www.google.com/maps?q=${mapEv.lat},${mapEv.lng}`} target="_blank" rel="noreferrer">Abrir no Google Maps ↗</a>
          </div>
        </Modal>
      )}
    </div>
  );
}
