import { useMemo, useState } from 'react';
import { Search, Lock, Unlock, Route } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BaseMap, VehicleMarker, FitBounds, FlyTo, GeofenceLayer } from '../components/Map';
import { useLiveVehicles } from '../lib/vehicles';
import { STATE_COLOR, STATE_LABEL, fmtRelative, fmtSpeed } from '../lib/format';
import { Loading, Empty, useToast, Confirm, useAsync } from '../components/ui';
import { api } from '../lib/api';
import type { Geofence, Vehicle } from '../lib/types';
import { vehicleImage } from '../lib/images';

export function LiveMap() {
  const { vehicles, loading } = useLiveVehicles();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [confirm, setConfirm] = useState<{ v: Vehicle; type: 'engineStop' | 'engineResume' } | null>(null);
  const [showFences, setShowFences] = useState(false);
  const { data: fences } = useAsync(() => api.get<Geofence[]>('/api/geofences'), []);
  const toast = useToast();
  const nav = useNavigate();

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return vehicles.filter((v) => (filter === 'all' || v.state === filter) && (!q || v.name.toLowerCase().includes(q) || v.plate?.toLowerCase().includes(q) || v.client_name?.toLowerCase().includes(q)));
  }, [vehicles, search, filter]);

  const sel = vehicles.find((v) => v.id === selected) ?? null;
  const points = useMemo(() => vehicles.filter((v) => v.lat != null).map((v) => [v.lat!, v.lng!] as [number, number]), [vehicles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vehicles.length };
    for (const v of vehicles) c[v.state] = (c[v.state] ?? 0) + 1;
    return c;
  }, [vehicles]);

  const sendCommand = async () => {
    if (!confirm) return;
    try {
      const r = await api.post<{ message: string }>('/api/commands', { deviceId: confirm.v.device_id, type: confirm.type });
      toast('success', r.message);
    } catch (e: any) {
      toast('error', e.message);
    }
    setConfirm(null);
  };

  return (
    <div className="map-page">
      <aside className="map-side">
        <div className="side-header">
          <div className="row" style={{ gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar veículo, placa ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 5 }}>
            {['all', 'moving', 'idle', 'stopped', 'offline'].map((k) => (
              <button key={k} className={`btn sm ${filter === k ? 'primary' : ''}`} onClick={() => setFilter(k)}>
                {k === 'all' ? 'Todos' : STATE_LABEL[k]} {counts[k] ? `(${counts[k]})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="side-list">
          {loading ? (
            <Loading />
          ) : !list.length ? (
            <Empty text="Nenhum veículo encontrado" />
          ) : (
            list.map((v) => (
              <div key={v.id} className={`vehicle-item ${selected === v.id ? 'selected' : ''}`} onClick={() => setSelected(v.id)}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img className="vehicle-thumb" src={vehicleImage(v.type, v.model)} alt="" />
                  <span className="dot" style={{ position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, border: '2px solid #fff', background: STATE_COLOR[v.state] }} />
                </div>
                <div className="v-main">
                  <div className="v-name">
                    <span className="truncate">{v.name}</span>
                    {v.blocked && <Lock size={13} color="#dc2626" />}
                  </div>
                  <div className="v-sub">
                    <span>{v.plate ?? v.client_name ?? '—'}</span>
                    <span style={{ color: STATE_COLOR[v.state], fontWeight: 600 }}>{STATE_LABEL[v.state]}</span>
                    {v.state === 'moving' && <span>{fmtSpeed(v.speed)}</span>}
                  </div>
                  <div className="tiny muted">{v.device_id ? `Atualizado ${fmtRelative(v.last_seen_at)}` : 'Sem rastreador vinculado'}</div>
                </div>
              </div>
            ))
          )}
        </div>
        {sel && sel.device_id && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }} className="row">
            <button className="btn sm" onClick={() => nav(`/historico?vehicleId=${sel.id}`)}>
              <Route size={14} /> Histórico
            </button>
            {sel.blocked ? (
              <button className="btn sm success" onClick={() => setConfirm({ v: sel, type: 'engineResume' })}>
                <Unlock size={14} /> Desbloquear
              </button>
            ) : (
              <button className="btn sm danger" onClick={() => setConfirm({ v: sel, type: 'engineStop' })}>
                <Lock size={14} /> Bloquear
              </button>
            )}
            <label className="checkbox small" style={{ marginLeft: 'auto' }}>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Seguir
            </label>
          </div>
        )}
      </aside>
      <div className="map-area">
        <BaseMap>
          {points.length > 0 && !selected && <FitBounds points={points} />}
          {sel && follow && sel.lat != null && <FlyTo target={[sel.lat, sel.lng!]} />}
          {showFences && fences && <GeofenceLayer fences={fences} />}
          {vehicles.map((v) => (
            <VehicleMarker key={v.id} v={v} selected={selected === v.id} onClick={() => setSelected(v.id)} />
          ))}
        </BaseMap>
        <div className="map-overlay top-right legend">
          {(['moving', 'idle', 'stopped', 'offline'] as const).map((k) => (
            <span key={k}>
              <span className="dot" style={{ background: STATE_COLOR[k] }} /> {STATE_LABEL[k]}
            </span>
          ))}
          <label className="checkbox" style={{ fontSize: 12 }}>
            <input type="checkbox" checked={showFences} onChange={(e) => setShowFences(e.target.checked)} /> Cercas
          </label>
        </div>
      </div>
      {confirm && (
        <Confirm
          title={confirm.type === 'engineStop' ? 'Bloquear motor' : 'Desbloquear motor'}
          danger={confirm.type === 'engineStop'}
          message={
            confirm.type === 'engineStop'
              ? `Enviar comando de BLOQUEIO para ${confirm.v.name}? Por segurança, faça isso apenas com o veículo parado. O rastreador corta a alimentação/combustível via relé.`
              : `Enviar comando de DESBLOQUEIO para ${confirm.v.name}?`
          }
          onConfirm={sendCommand}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
