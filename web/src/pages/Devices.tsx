import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Radio, Smartphone, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Device, Vehicle, SetupInstructions } from '../lib/types';
import { Badge, Confirm, Empty, Field, Loading, Modal, useToast, CopyButton } from '../components/ui';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { useRealtime } from '../lib/realtime';
import { TRACKER_IMAGE } from '../lib/images';

interface Form {
  id?: number;
  imei: string;
  name: string;
  protocol: string;
  model: string;
  simPhone: string;
  simCarrier: string;
  vehicleId: number;
  status: 'pending' | 'active' | 'disabled';
  notes: string;
}
const empty: Form = { imei: '', name: '', protocol: '', model: '', simPhone: '', simCarrier: '', vehicleId: 0, status: 'active', notes: '' };

export function Devices() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [options, setOptions] = useState<{ models: { id: string; name: string; protocol: string }[]; carriers: { id: string; name: string }[] }>({ models: [], carriers: [] });
  const [editing, setEditing] = useState<Form | null>(null);
  const [del, setDel] = useState<Device | null>(null);
  const [setup, setSetup] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<Device[]>('/api/devices').then(setDevices).catch((e) => toast('error', e.message));
    api.get<Vehicle[]>('/api/vehicles', { includeInactive: 1 }).then(setVehicles);
  };
  useEffect(() => {
    load();
    api.get('/api/setup/options').then((o: any) => setOptions(o));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((m) => {
    if (m.type === 'device' && m.data?.new) load();
    if (m.type === 'device' && !m.data?.new) setDevices((list) => list?.map((d) => (d.id === m.data.id ? { ...d, online: m.data.online ?? d.online, last_seen_at: m.data.online ? Date.now() : d.last_seen_at } : d)) ?? null);
    if (m.type === 'position') setDevices((list) => list?.map((d) => (d.id === m.data.device_id ? { ...d, online: true, last_seen_at: Date.now(), lat: m.data.lat, lng: m.data.lng, speed: m.data.speed, fix_time: m.data.fix_time, positions_count: d.positions_count + 1 } : d)) ?? null);
  });

  const openEdit = (d: Device) => setEditing({ id: d.id, imei: d.imei, name: d.name ?? '', protocol: d.protocol ?? '', model: d.model ?? '', simPhone: d.sim_phone ?? '', simCarrier: d.sim_carrier ?? '', vehicleId: d.vehicle_id ?? 0, status: d.status, notes: d.notes ?? '' });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { imei: editing.imei, name: editing.name || null, protocol: editing.protocol || null, model: editing.model || null, simPhone: editing.simPhone || null, simCarrier: editing.simCarrier || null, vehicleId: editing.vehicleId || null, status: editing.status, notes: editing.notes || null };
      if (editing.id) await api.put(`/api/devices/${editing.id}`, body);
      else await api.post('/api/devices', body);
      toast('success', 'Rastreador salvo');
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
    await api.delete(`/api/devices/${del.id}`);
    toast('success', 'Rastreador excluído');
    setDel(null);
    load();
  };

  const pending = devices?.filter((d) => d.status === 'pending') ?? [];
  const usedVehicleIds = new Set((devices ?? []).filter((d) => d.vehicle_id && d.id !== editing?.id).map((d) => d.vehicle_id));

  return (
    <div className="stack">
      {pending.length > 0 && (
        <div className="alert warning">
          <Radio size={18} />
          <div>
            <strong>{pending.length} rastreador(es) novo(s)</strong> conectaram e aguardam vínculo com um veículo. Clique em <em>Vincular</em> para associar ao veículo do cliente.
          </div>
        </div>
      )}
      <div className="row between">
        <span className="muted small">Rastreadores que apontarem para este servidor aparecem aqui automaticamente na primeira conexão.</span>
        <div className="row">
          <button className="btn" onClick={() => setSetup({} as Device)}>
            <Smartphone size={16} /> Instruções de configuração
          </button>
          <button className="btn primary" onClick={() => setEditing({ ...empty })}>
            <Plus size={16} /> Cadastrar manualmente
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-body tight">
          {!devices ? (
            <Loading />
          ) : !devices.length ? (
            <Empty text="Nenhum rastreador conectou ainda. Configure o aparelho com o IP/porta deste servidor (botão Instruções de configuração)." icon={<img src={TRACKER_IMAGE} alt="" style={{ width: 140, borderRadius: 14 }} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>IMEI / Nome</th>
                    <th>Protocolo</th>
                    <th>Veículo</th>
                    <th>Conexão</th>
                    <th>Última posição</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="strong mono">{d.imei}</div>
                        <div className="tiny muted">{d.name} {d.sim_phone ? `· chip ${d.sim_phone}` : ''}</div>
                      </td>
                      <td><Badge tone="neutral">{d.protocol?.toUpperCase() ?? '—'}</Badge></td>
                      <td>
                        {d.vehicle_name ? (
                          <>
                            <div>{d.vehicle_name}</div>
                            <div className="tiny muted">{d.client_name}</div>
                          </>
                        ) : (
                          <button className="btn sm primary" onClick={() => openEdit(d)}>
                            <Link2 size={14} /> Vincular
                          </button>
                        )}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="dot" style={{ background: d.online ? '#16a34a' : '#ef4444' }} /> {d.online ? 'Online' : 'Offline'}
                        </span>
                        <div className="tiny muted">{fmtRelative(d.last_seen_at)} {d.last_ip ? `· ${d.last_ip}` : ''}</div>
                      </td>
                      <td className="small">
                        {d.lat != null ? (
                          <>
                            <div className="mono">{d.lat.toFixed(5)}, {d.lng!.toFixed(5)}</div>
                            <div className="tiny muted">{fmtDateTime(d.fix_time)} · {d.positions_count} posições</div>
                          </>
                        ) : (
                          <span className="muted">sem fix GPS</span>
                        )}
                      </td>
                      <td><Badge tone={d.status === 'active' ? 'success' : d.status === 'pending' ? 'warning' : 'neutral'}>{d.status === 'active' ? 'Ativo' : d.status === 'pending' ? 'Pendente' : 'Desativado'}</Badge></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm ghost icon" title="Instruções de configuração" onClick={() => setSetup(d)}><Smartphone size={15} /></button>
                        <button className="btn sm ghost icon" title="Editar" onClick={() => openEdit(d)}><Pencil size={15} /></button>
                        <button className="btn sm ghost icon" title="Excluir" onClick={() => setDel(d)}><Trash2 size={15} /></button>
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
          title={editing.id ? 'Editar rastreador' : 'Cadastrar rastreador'}
          onClose={() => setEditing(null)}
          size="lg"
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy || editing.imei.length < 10} onClick={save}>Salvar</button>
            </>
          }
        >
          <div className="grid cols-2">
            <Field label="IMEI" hint="Impresso na etiqueta do aparelho (15 dígitos)"><input className="input mono" value={editing.imei} onChange={(e) => setEditing({ ...editing, imei: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Nome / identificação"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Modelo">
              <select className="select" value={editing.model} onChange={(e) => { const m = options.models.find((x) => x.id === e.target.value); setEditing({ ...editing, model: e.target.value, protocol: m?.protocol ?? editing.protocol }); }}>
                <option value="">Não informado</option>
                {options.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Protocolo" hint="Detectado automaticamente na primeira conexão">
              <select className="select" value={editing.protocol} onChange={(e) => setEditing({ ...editing, protocol: e.target.value })}>
                <option value="">Automático</option>
                <option value="gt06">GT06 / Concox</option>
                <option value="h02">H02 / Sinotrack</option>
                <option value="tk103">TK103 / Coban</option>
              </select>
            </Field>
            <Field label="Número do chip (SIM)"><input className="input" value={editing.simPhone} onChange={(e) => setEditing({ ...editing, simPhone: e.target.value })} placeholder="(11) 99999-9999" /></Field>
            <Field label="Operadora do chip">
              <select className="select" value={editing.simCarrier} onChange={(e) => setEditing({ ...editing, simCarrier: e.target.value })}>
                <option value="">Não informada</option>
                {options.carriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Veículo vinculado">
              <select className="select" value={editing.vehicleId} onChange={(e) => setEditing({ ...editing, vehicleId: Number(e.target.value) })}>
                <option value={0}>Nenhum</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id} disabled={usedVehicleIds.has(v.id)}>{v.name} {v.plate ? `· ${v.plate}` : ''} — {v.client_name}{usedVehicleIds.has(v.id) ? ' (já possui rastreador)' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Form['status'] })}>
                <option value="active">Ativo</option>
                <option value="pending">Pendente</option>
                <option value="disabled">Desativado (recusar conexões)</option>
              </select>
            </Field>
          </div>
          <Field label="Observações"><textarea className="textarea" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
        </Modal>
      )}
      {del && <Confirm title="Excluir rastreador" danger message={`Excluir o rastreador ${del.imei}? Todo o histórico de posições será apagado.`} onConfirm={remove} onCancel={() => setDel(null)} />}
      {setup && <SetupModal device={setup.id ? setup : null} onClose={() => setSetup(null)} />}
    </div>
  );
}

export function SetupModal({ device, onClose }: { device: Device | null; onClose: () => void }) {
  const [options, setOptions] = useState<{ models: { id: string; name: string; protocol: string; description: string }[]; carriers: { id: string; name: string; apn: string }[] }>({ models: [], carriers: [] });
  const [model, setModel] = useState(device?.model ?? 'gt06');
  const [carrier, setCarrier] = useState(device?.sim_carrier ?? 'vivo');
  const [data, setData] = useState<SetupInstructions | null>(null);
  useEffect(() => {
    api.get('/api/setup/options').then((o: any) => setOptions(o));
  }, []);
  useEffect(() => {
    api.get<SetupInstructions>('/api/setup/instructions', { model, carrier, imei: device?.imei }).then(setData);
  }, [model, carrier, device?.imei]);
  const m = options.models.find((x) => x.id === model);
  return (
    <Modal title={`Configurar rastreador${device ? ` ${device.imei}` : ''} por SMS`} onClose={onClose} size="lg">
      <div className="grid cols-2 mb">
        <Field label="Modelo do rastreador">
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {options.models.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Operadora do chip">
          <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {options.carriers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.apn})</option>
            ))}
          </select>
        </Field>
      </div>
      {m && <p className="small muted mb">{m.description}</p>}
      {!data ? (
        <Loading />
      ) : (
        <>
          {!data.host || data.host === 'SEU_IP_OU_DOMINIO' ? (
            <div className="alert danger mb">Defina o <strong>endereço público do servidor</strong> em Configurações antes de configurar os rastreadores.</div>
          ) : (
            <div className="alert success mb">
              Servidor: <strong className="mono">{data.host}</strong> · Porta TCP: <strong className="mono">{data.port}</strong> · Protocolo: <strong>{data.model.protocol.toUpperCase()}</strong>
            </div>
          )}
          <h3 className="mb">Envie estes SMS para o número do chip do rastreador, na ordem:</h3>
          {data.steps.map((s, i) => (
            <div className="sms-step" key={i}>
              <div className="num">{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="strong">{s.title}</div>
                <div className="sms">
                  <span>{s.sms}</span>
                  <CopyButton text={s.sms} />
                </div>
                {s.note && <div className="tiny muted">{s.note}</div>}
              </div>
            </div>
          ))}
          <h3 className="mt mb">Dicas</h3>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
            {data.tips.map((t, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
