import { Link } from 'react-router-dom';
import { Car, Wifi, WifiOff, Navigation, Bell, Route, Users, Radio, Server } from 'lucide-react';
import { api } from '../lib/api';
import type { Dashboard as DashboardData, EventRow } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Stat, useAsync, Loading, Empty, Badge } from '../components/ui';
import { fmtDistance, fmtDuration, fmtRelative, fmtDateTime, STATE_LABEL, STATE_COLOR } from '../lib/format';
import { useLiveVehicles } from '../lib/vehicles';
import { useRealtime } from '../lib/realtime';
import { useState, useEffect } from 'react';
import { vehicleImage } from '../lib/images';

export function Dashboard() {
  const { isStaff } = useAuth();
  const { data, loading, reload } = useAsync(() => api.get<DashboardData>('/api/dashboard'), []);
  const { vehicles } = useLiveVehicles();
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    api.get<EventRow[]>('/api/events', { limit: 8 }).then(setEvents).catch(() => {});
  }, []);
  useRealtime((m) => {
    if (m.type === 'event') setEvents((e) => [m.data, ...e].slice(0, 8));
    if (m.type === 'trip' && m.data.status === 'closed') reload();
  });

  if (loading || !data) return <Loading />;

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat label="Veículos" value={data.vehicles} sub={`${data.devices} rastreador(es)`} icon={<Car size={20} />} color="#2563eb" />
        <Stat label="Online" value={data.online} sub={`${data.offline} sem sinal`} icon={<Wifi size={20} />} color="#16a34a" />
        <Stat label="Em movimento" value={data.moving} sub="agora" icon={<Navigation size={20} />} color="#f59e0b" />
        <Stat label="Alertas pendentes" value={data.alerts.total} sub={data.alerts.critical ? `${data.alerts.critical} crítico(s)` : 'nenhum crítico'} icon={<Bell size={20} />} color={data.alerts.critical ? '#dc2626' : '#0284c7'} />
      </div>
      <div className="grid cols-4">
        <Stat label="Viagens hoje" value={data.today.trips} sub={fmtDistance(data.today.distanceM)} icon={<Route size={20} />} color="#7c3aed" />
        <Stat label="Tempo em movimento hoje" value={fmtDuration(data.today.durationS)} sub={`${data.today.positions} posições recebidas`} icon={<Navigation size={20} />} color="#0891b2" />
        {isStaff && <Stat label="Clientes ativos" value={data.clients ?? 0} icon={<Users size={20} />} color="#db2777" />}
        {isStaff && (
          <Stat
            label="Gateway de rastreadores"
            value={data.gateway?.connections ?? 0}
            sub={data.devicesPending ? <Link to="/rastreadores">{data.devicesPending} novo(s) aguardando vínculo</Link> : `${data.gateway?.identified ?? 0} identificado(s) · ${data.gateway?.wsClients ?? 0} painel(is) aberto(s)`}
            icon={<Server size={20} />}
            color={data.devicesPending ? '#d97706' : '#475569'}
          />
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-header">
            <h2>Veículos</h2>
            <Link className="btn sm" to="/mapa">
              Ver no mapa
            </Link>
          </div>
          <div className="card-body tight">
            {!vehicles.length ? (
              <Empty text={isStaff ? 'Nenhum veículo cadastrado. Cadastre clientes e veículos no menu Administração.' : 'Nenhum veículo vinculado à sua conta.'} icon={<Car size={34} />} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Veículo</th>
                      <th>Status</th>
                      <th>Velocidade</th>
                      <th>Última comunicação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.slice(0, 12).map((v) => (
                      <tr key={v.id}>
                        <td>
                          <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                            <img className="vehicle-thumb" src={vehicleImage(v.type, v.model)} alt="" />
                            <div>
                              <div className="strong">{v.name}</div>
                              <div className="tiny muted">{v.plate ?? v.client_name}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span className="dot" style={{ background: STATE_COLOR[v.state] }} />
                            {STATE_LABEL[v.state]}
                          </span>
                        </td>
                        <td>{v.speed != null ? `${Math.round(v.speed)} km/h` : '—'}</td>
                        <td className="small muted">{fmtRelative(v.last_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Últimos alertas</h2>
            <Link className="btn sm" to="/alertas">
              Ver todos
            </Link>
          </div>
          <div className="card-body tight">
            {!events.length ? (
              <Empty text="Nenhum evento registrado ainda." icon={<Bell size={34} />} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td style={{ width: 90 }}>
                          <Badge tone={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'info'}>{e.severity === 'critical' ? 'Crítico' : e.severity === 'warning' ? 'Atenção' : 'Info'}</Badge>
                        </td>
                        <td>
                          <div className="strong">{e.title}</div>
                          <div className="tiny muted">{e.vehicle_name ?? e.imei} · {e.message}</div>
                        </td>
                        <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.event_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {isStaff && data.devicesPending > 0 && (
        <div className="alert warning">
          <Radio size={18} />
          <div>
            <strong>{data.devicesPending} rastreador(es) novo(s)</strong> conectaram ao servidor e aguardam vínculo com um veículo. <Link to="/rastreadores">Vincular agora →</Link>
          </div>
        </div>
      )}
      {isStaff && data.devices === 0 && (
        <div className="alert info">
          <WifiOff size={18} />
          <div>
            Nenhum rastreador conectou ainda. Configure o aparelho para apontar para este servidor: veja as instruções em <Link to="/configuracoes">Configurações → Configurar rastreador</Link>.
          </div>
        </div>
      )}
    </div>
  );
}
