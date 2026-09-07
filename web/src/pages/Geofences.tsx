import { useEffect, useMemo, useState } from 'react';
import { useMapEvents, Circle, Polygon, CircleMarker } from 'react-leaflet';
import { Plus, Shapes, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import type { Geofence, Vehicle, Client } from '../lib/types';
import { useAuth } from '../lib/auth';
import { BaseMap, GeofenceLayer, FitBounds } from '../components/Map';
import { Empty, Field, Loading, Modal, useToast, Confirm } from '../components/ui';

type Draft = { type: 'circle'; center: { lat: number; lng: number } | null; radius: number } | { type: 'polygon'; points: { lat: number; lng: number }[] };

function Drawer({ draft, setDraft }: { draft: Draft | null; setDraft: (d: Draft) => void }) {
  useMapEvents({
    click(e) {
      if (!draft) return;
      if (draft.type === 'circle') setDraft({ ...draft, center: { lat: e.latlng.lat, lng: e.latlng.lng } });
      else setDraft({ ...draft, points: [...draft.points, { lat: e.latlng.lat, lng: e.latlng.lng }] });
    },
  });
  if (!draft) return null;
  if (draft.type === 'circle') return draft.center ? <Circle center={[draft.center.lat, draft.center.lng]} radius={draft.radius} pathOptions={{ color: '#7c3aed', dashArray: '6 4' }} /> : null;
  return (
    <>
      {draft.points.length >= 2 && <Polygon positions={draft.points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#7c3aed', dashArray: '6 4' }} />}
      {draft.points.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#7c3aed', fillOpacity: 1 }} />
      ))}
    </>
  );
}

export function Geofences() {
  const { isStaff, user } = useAuth();
  const toast = useToast();
  const [fences, setFences] = useState<Geofence[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Partial<Geofence> | null>(null);
  const [form, setForm] = useState({ name: '', clientId: 0, vehicleId: 0, color: '#2563eb', alertOnEnter: true, alertOnExit: true, active: true });
  const [del, setDel] = useState<Geofence | null>(null);
  const [selected, setSelected] = useState<Geofence | null>(null);

  const load = () => api.get<Geofence[]>('/api/geofences').then(setFences).catch((e) => toast('error', e.message));
  useEffect(() => {
    load();
    api.get<Vehicle[]>('/api/vehicles').then(setVehicles);
    if (isStaff) api.get<Client[]>('/api/clients').then(setClients);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = (type: 'circle' | 'polygon') => {
    setEditing({});
    setSelected(null);
    setForm({ name: '', clientId: user?.clientId ?? clients[0]?.id ?? 0, vehicleId: 0, color: '#2563eb', alertOnEnter: true, alertOnExit: true, active: true });
    setDraft(type === 'circle' ? { type: 'circle', center: null, radius: 300 } : { type: 'polygon', points: [] });
  };
  const startEdit = (g: Geofence) => {
    setEditing(g);
    setSelected(g);
    setForm({ name: g.name, clientId: g.client_id, vehicleId: g.vehicle_id ?? 0, color: g.color, alertOnEnter: !!g.alert_on_enter, alertOnExit: !!g.alert_on_exit, active: !!g.active });
    setDraft(g.geometry.type === 'circle' ? { type: 'circle', center: g.geometry.center, radius: g.geometry.radius } : { type: 'polygon', points: [...g.geometry.points] });
  };
  const cancel = () => {
    setEditing(null);
    setDraft(null);
  };

  const geometryReady = draft && (draft.type === 'circle' ? !!draft.center : draft.points.length >= 3);

  const save = async () => {
    if (!draft || !geometryReady) return toast('warning', 'Desenhe a cerca no mapa');
    if (!form.name.trim()) return toast('warning', 'Informe um nome');
    const geometry = draft.type === 'circle' ? { type: 'circle', center: draft.center, radius: draft.radius } : { type: 'polygon', points: draft.points };
    const body = { name: form.name, clientId: form.clientId || undefined, vehicleId: form.vehicleId || null, geometry, color: form.color, alertOnEnter: form.alertOnEnter, alertOnExit: form.alertOnExit, active: form.active };
    try {
      if (editing?.id) await api.put(`/api/geofences/${editing.id}`, body);
      else await api.post('/api/geofences', body);
      toast('success', 'Cerca salva');
      cancel();
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  const remove = async () => {
    if (!del) return;
    await api.delete(`/api/geofences/${del.id}`);
    setDel(null);
    setSelected(null);
    load();
    toast('success', 'Cerca excluída');
  };

  const bounds = useMemo(() => {
    const pts: [number, number][] = [];
    for (const g of fences ?? []) {
      if (g.geometry.type === 'circle') pts.push([g.geometry.center.lat, g.geometry.center.lng]);
      else for (const p of g.geometry.points) pts.push([p.lat, p.lng]);
    }
    return pts;
  }, [fences]);

  const clientVehicles = vehicles.filter((v) => !form.clientId || v.client_id === form.clientId);

  return (
    <div className="map-page">
      <aside className="map-side">
        <div className="side-header row between">
          <h3>Cercas virtuais</h3>
          {!editing && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm primary" onClick={() => startNew('circle')}>
                <Plus size={14} /> Círculo
              </button>
              <button className="btn sm primary" onClick={() => startNew('polygon')}>
                <Plus size={14} /> Polígono
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="side-list" style={{ padding: 14 }}>
            <div className="alert info mb small">
              {draft?.type === 'circle' ? 'Clique no mapa para posicionar o centro do círculo e ajuste o raio abaixo.' : 'Clique no mapa para adicionar os vértices do polígono (mínimo 3).'}
            </div>
            <Field label="Nome">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Garagem, Cliente X, Zona de risco" />
            </Field>
            {isStaff && (
              <Field label="Cliente">
                <select className="select" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value), vehicleId: 0 })} disabled={!!editing.id}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Aplicar a" hint="Todos os veículos do cliente ou apenas um">
              <select className="select" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })}>
                <option value={0}>Todos os veículos</option>
                {clientVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </Field>
            {draft?.type === 'circle' && (
              <Field label={`Raio: ${draft.radius} m`}>
                <input type="range" min={50} max={5000} step={10} value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: Number(e.target.value) })} />
              </Field>
            )}
            {draft?.type === 'polygon' && (
              <div className="row mb small">
                <span>{draft.points.length} ponto(s)</span>
                <button className="btn sm" onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })} disabled={!draft.points.length}>Desfazer</button>
                <button className="btn sm" onClick={() => setDraft({ ...draft, points: [] })} disabled={!draft.points.length}>Limpar</button>
              </div>
            )}
            <Field label="Cor">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
            <label className="checkbox mb"><input type="checkbox" checked={form.alertOnEnter} onChange={(e) => setForm({ ...form, alertOnEnter: e.target.checked })} /> Alertar ao entrar</label>
            <label className="checkbox mb"><input type="checkbox" checked={form.alertOnExit} onChange={(e) => setForm({ ...form, alertOnExit: e.target.checked })} /> Alertar ao sair</label>
            <label className="checkbox mb"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativa</label>
            <div className="row">
              <button className="btn primary" onClick={save} disabled={!geometryReady}>Salvar</button>
              <button className="btn" onClick={cancel}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="side-list">
            {!fences ? (
              <Loading />
            ) : !fences.length ? (
              <Empty text="Nenhuma cerca cadastrada. Crie um círculo ou polígono para receber alertas de entrada e saída." icon={<Shapes size={34} />} />
            ) : (
              fences.map((g) => (
                <div key={g.id} className={`vehicle-item ${selected?.id === g.id ? 'selected' : ''}`} onClick={() => setSelected(g)}>
                  <div className="v-icon" style={{ background: g.color }}>
                    <Shapes size={18} />
                  </div>
                  <div className="v-main">
                    <div className="v-name">{g.name} {!g.active && <span className="badge neutral">inativa</span>}</div>
                    <div className="v-sub">
                      <span>{g.type === 'circle' ? `Círculo · ${g.geometry.type === 'circle' ? g.geometry.radius : 0} m` : `Polígono · ${g.geometry.type === 'polygon' ? g.geometry.points.length : 0} pontos`}</span>
                      <span>{g.vehicle_name ?? 'Todos os veículos'}</span>
                      {isStaff && <span>{g.client_name}</span>}
                    </div>
                  </div>
                  <button className="btn sm ghost icon" onClick={(e) => { e.stopPropagation(); startEdit(g); }} title="Editar"><Pencil size={15} /></button>
                  <button className="btn sm ghost icon" onClick={(e) => { e.stopPropagation(); setDel(g); }} title="Excluir"><Trash2 size={15} /></button>
                </div>
              ))
            )}
          </div>
        )}
      </aside>
      <div className="map-area">
        <BaseMap>
          {bounds.length > 0 && !editing && <FitBounds points={bounds} deps={[fences?.length]} />}
          {selected && !editing && <FitBounds points={selected.geometry.type === 'circle' ? [[selected.geometry.center.lat, selected.geometry.center.lng]] : selected.geometry.points.map((p) => [p.lat, p.lng] as [number, number])} deps={[selected.id]} />}
          <GeofenceLayer fences={(fences ?? []).filter((g) => g.id !== editing?.id)} onClick={(g) => !editing && setSelected(g)} />
          <Drawer draft={draft} setDraft={setDraft} />
        </BaseMap>
      </div>
      {del && <Confirm title="Excluir cerca" danger message={`Excluir a cerca "${del.name}"?`} onConfirm={remove} onCancel={() => setDel(null)} />}
      {false && <Modal title="" onClose={() => {}}>{null}</Modal>}
    </div>
  );
}
