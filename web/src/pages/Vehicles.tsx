import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Car } from 'lucide-react';
import { api } from '../lib/api';
import type { Vehicle, Client, Device } from '../lib/types';
import { Badge, Confirm, Empty, Field, Loading, Modal, useToast } from '../components/ui';
import { fmtDistance, fmtRelative, STATE_COLOR, STATE_LABEL, VEHICLE_TYPES } from '../lib/format';
import { vehicleImage } from '../lib/images';

interface Form {
  id?: number;
  clientId: number;
  name: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  type: string;
  speedLimit: string;
  notes: string;
  active: boolean;
  deviceId: number;
}

const empty: Form = { clientId: 0, name: '', plate: '', brand: '', model: '', year: '', color: '', type: 'car', speedLimit: '', notes: '', active: true, deviceId: 0 };

export function Vehicles() {
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [clientFilter, setClientFilter] = useState(0);
  const [editing, setEditing] = useState<Form | null>(null);
  const [del, setDel] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<Vehicle[]>('/api/vehicles', { clientId: clientFilter || undefined, includeInactive: 1 }).then(setVehicles).catch((e) => toast('error', e.message));
    api.get<Device[]>('/api/devices').then(setDevices);
  };
  useEffect(() => {
    api.get<Client[]>('/api/clients').then(setClients);
  }, []);
  useEffect(load, [clientFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => setEditing({ ...empty, clientId: clientFilter || clients[0]?.id || 0 });
  const openEdit = (v: Vehicle) =>
    setEditing({ id: v.id, clientId: v.client_id, name: v.name, plate: v.plate ?? '', brand: v.brand ?? '', model: v.model ?? '', year: v.year ? String(v.year) : '', color: v.color ?? '', type: v.type, speedLimit: v.speed_limit ? String(v.speed_limit) : '', notes: v.notes ?? '', active: !!v.active, deviceId: v.device_id ?? 0 });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { clientId: editing.clientId, name: editing.name, plate: editing.plate || null, brand: editing.brand || null, model: editing.model || null, year: editing.year ? Number(editing.year) : null, color: editing.color || null, type: editing.type, speedLimit: editing.speedLimit ? Number(editing.speedLimit) : null, notes: editing.notes || null, active: editing.active, deviceId: editing.deviceId || null };
      if (editing.id) await api.put(`/api/vehicles/${editing.id}`, body);
      else await api.post('/api/vehicles', body);
      toast('success', 'Veículo salvo');
      setEditing(null);
      load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    await api.delete(`/api/vehicles/${del.id}`);
    toast('success', 'Veículo excluído');
    setDel(null);
    load();
  };

  const availableDevices = devices.filter((d) => !d.vehicle_id || d.vehicle_id === editing?.id);

  return (
    <div className="stack">
      <div className="row between">
        <select className="select" style={{ maxWidth: 280 }} value={clientFilter} onChange={(e) => setClientFilter(Number(e.target.value))}>
          <option value={0}>Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn primary" onClick={openNew} disabled={!clients.length}>
          <Plus size={16} /> Novo veículo
        </button>
      </div>
      {!clients.length && <div className="alert info">Cadastre um cliente antes de adicionar veículos.</div>}
      <div className="card">
        <div className="card-body tight">
          {!vehicles ? (
            <Loading />
          ) : !vehicles.length ? (
            <Empty text="Nenhum veículo cadastrado" icon={<Car size={34} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Veículo</th>
                    <th>Cliente</th>
                    <th>Rastreador</th>
                    <th>Status</th>
                    <th>Última comunicação</th>
                    <th>Km rodados</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} style={{ opacity: v.active ? 1 : 0.55 }}>
                      <td>
                        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                          <img className="vehicle-thumb" src={vehicleImage(v.type, v.model)} alt="" />
                          <div>
                            <div className="strong">{v.name} {!v.active && <Badge tone="neutral">inativo</Badge>}</div>
                            <div className="tiny muted">{[v.plate, v.brand, v.model, v.year, VEHICLE_TYPES[v.type]].filter(Boolean).join(' · ')}</div>
                          </div>
                        </div>
                      </td>
                      <td>{v.client_name}</td>
                      <td>{v.imei ? <span className="mono">{v.imei}</span> : <Badge tone="warning">sem rastreador</Badge>}</td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="dot" style={{ background: STATE_COLOR[v.state] }} /> {STATE_LABEL[v.state]}
                        </span>
                      </td>
                      <td className="small muted">{v.device_id ? fmtRelative(v.last_seen_at) : '—'}</td>
                      <td>{fmtDistance(v.total_distance_m)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm ghost icon" onClick={() => openEdit(v)} title="Editar"><Pencil size={15} /></button>
                        <button className="btn sm ghost icon" onClick={() => setDel(v)} title="Excluir"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <Modal
          title={editing.id ? 'Editar veículo' : 'Novo veículo'}
          onClose={() => setEditing(null)}
          size="lg"
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy || !editing.name || !editing.clientId} onClick={save}>Salvar</button>
            </>
          }
        >
          <div className="grid cols-2">
            <Field label="Cliente">
              <select className="select" value={editing.clientId} onChange={(e) => setEditing({ ...editing, clientId: Number(e.target.value) })}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nome de exibição" hint="Ex.: Fiat Strada branca, Moto do João">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Placa"><input className="input" value={editing.plate} onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })} placeholder="ABC1D23" /></Field>
            <Field label="Tipo">
              <select className="select" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                {Object.entries(VEHICLE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Marca"><input className="input" value={editing.brand} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} /></Field>
            <Field label="Modelo"><input className="input" value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} /></Field>
            <Field label="Ano"><input className="input" type="number" value={editing.year} onChange={(e) => setEditing({ ...editing, year: e.target.value })} /></Field>
            <Field label="Cor"><input className="input" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></Field>
            <Field label="Limite de velocidade (km/h)" hint="Vazio = usar o limite padrão do sistema">
              <input className="input" type="number" value={editing.speedLimit} onChange={(e) => setEditing({ ...editing, speedLimit: e.target.value })} />
            </Field>
            <Field label="Rastreador vinculado" hint="Rastreadores que já conectaram aparecem aqui automaticamente">
              <select className="select" value={editing.deviceId} onChange={(e) => setEditing({ ...editing, deviceId: Number(e.target.value) })}>
                <option value={0}>Nenhum</option>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.imei} {d.name ? `· ${d.name}` : ''} {d.protocol ? `(${d.protocol})` : ''}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Observações"><textarea className="textarea" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          <label className="checkbox"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Veículo ativo</label>
        </Modal>
      )}
      {del && <Confirm title="Excluir veículo" danger message={`Excluir "${del.name}"? O histórico de posições e viagens deste veículo será perdido.`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
