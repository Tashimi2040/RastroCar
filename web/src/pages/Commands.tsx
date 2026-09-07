import { useEffect, useState } from 'react';
import { Send, TerminalSquare } from 'lucide-react';
import { api } from '../lib/api';
import type { Command, Vehicle } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Badge, Empty, Field, Loading, useToast, Confirm } from '../components/ui';
import { COMMAND_STATUS, fmtDateTime } from '../lib/format';
import { useRealtime } from '../lib/realtime';

export function Commands() {
  const { isStaff } = useAuth();
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [vehicleId, setVehicleId] = useState(0);
  const [type, setType] = useState('positionSingle');
  const [payload, setPayload] = useState('');
  const [commands, setCommands] = useState<Command[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Command[]>('/api/commands').then(setCommands);
  useEffect(() => {
    api.get<Vehicle[]>('/api/vehicles').then((v) => {
      setVehicles(v.filter((x) => x.device_id));
      if (v.length) setVehicleId(v.find((x) => x.device_id)?.id ?? 0);
    });
    api.get<Record<string, string>>('/api/commands/types').then(setLabels);
    load();
  }, []);
  useRealtime((m) => {
    if (m.type === 'command') setCommands((list) => (list ? (list.some((c) => c.id === m.data.id) ? list.map((c) => (c.id === m.data.id ? { ...c, ...m.data } : c)) : [m.data, ...list]) : list));
  });

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const allowedTypes = isStaff ? Object.keys(labels) : ['engineStop', 'engineResume', 'positionSingle'];

  const send = async () => {
    if (!vehicle?.device_id) return;
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>('/api/commands', { deviceId: vehicle.device_id, type, payload: payload || null });
      toast(r.message.includes('offline') ? 'warning' : 'success', r.message);
      setPayload('');
      load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const tone = (s: string) => (s === 'confirmed' ? 'success' : s === 'failed' ? 'danger' : s === 'sent' ? 'info' : s === 'cancelled' ? 'neutral' : 'warning');

  return (
    <div className="stack">
      <div className="grid cols-2">
        <div className="card">
          <div className="card-header"><h2>Enviar comando</h2></div>
          <div className="card-body">
            {!vehicles.length ? (
              <Empty text="Nenhum veículo com rastreador vinculado" />
            ) : (
              <>
                <Field label="Veículo">
                  <select className="select" value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} {v.plate ? `· ${v.plate}` : ''} {v.online ? '(online)' : '(offline)'}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Comando">
                  <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                    {allowedTypes.map((t) => (
                      <option key={t} value={t}>{labels[t] ?? t}</option>
                    ))}
                  </select>
                </Field>
                {type === 'custom' && (
                  <Field label="Conteúdo" hint="Texto exatamente como o fabricante especifica. Ex.: GT06 → PARAM# · H02 → *HQ,IMEI,CR,HHMMSS# · TK103 → **,imei:IMEI,B">
                    <input className="input mono" value={payload} onChange={(e) => setPayload(e.target.value)} />
                  </Field>
                )}
                {type === 'setInterval' && (
                  <Field label="Intervalo (segundos)">
                    <input className="input" type="number" min={5} max={3600} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="10" />
                  </Field>
                )}
                {(type === 'engineStop' || type === 'engineResume') && isStaff && (
                  <Field label="Variante do comando" hint="GT06 moderno usa RELAY; modelos antigos usam DYD/HFYD com senha">
                    <select className="select" value={payload} onChange={(e) => setPayload(e.target.value)}>
                      <option value="">RELAY (padrão)</option>
                      <option value="dyd">DYD / HFYD (antigo)</option>
                    </select>
                  </Field>
                )}
                {vehicle && !vehicle.online && <div className="alert warning mb small">O rastreador está offline. O comando ficará na fila e será enviado assim que ele conectar.</div>}
                <button className="btn primary" disabled={busy || !vehicle} onClick={() => (type === 'engineStop' || type === 'factoryReset' ? setConfirm(true) : send())}>
                  <Send size={15} /> Enviar
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2>Como funciona o bloqueio</h2></div>
          <div className="card-body small stack" style={{ gap: 8 }}>
            <p>O comando é enviado pela conexão de dados do rastreador (GPRS), sem custo de SMS. A plataforma registra quando foi enviado e a confirmação devolvida pelo aparelho.</p>
            <p><strong>Bloquear motor</strong> aciona o relé instalado no veículo (corte de combustível/ignição). Por segurança, execute somente com o veículo parado.</p>
            <p><strong>Desbloquear</strong> libera o relé. Se o rastreador estiver sem sinal, o comando fica pendente por até 24 horas.</p>
            <p><strong>Solicitar posição</strong> força o aparelho a enviar a localização atual imediatamente.</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h2>Histórico de comandos</h2></div>
        <div className="card-body tight">
          {!commands ? (
            <Loading />
          ) : !commands.length ? (
            <Empty text="Nenhum comando enviado" icon={<TerminalSquare size={34} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Veículo</th>
                    <th>Comando</th>
                    <th>Status</th>
                    <th>Resposta</th>
                    {isStaff && <th>Por</th>}
                  </tr>
                </thead>
                <tbody>
                  {commands.map((c) => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.created_at)}</td>
                      <td>{c.vehicle_name ?? c.imei}</td>
                      <td>{labels[c.type] ?? c.type}{c.payload && <span className="muted mono"> {c.payload}</span>}</td>
                      <td><Badge tone={tone(c.status)}>{COMMAND_STATUS[c.status]}</Badge></td>
                      <td className="small mono">{c.response ?? c.error ?? (c.sent_at ? `enviado ${fmtDateTime(c.sent_at)}` : '')}</td>
                      {isStaff && <td className="small muted">{c.user_name}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {confirm && <Confirm title={labels[type]} danger message={`Confirma o envio de "${labels[type]}" para ${vehicle?.name}?`} onConfirm={send} onCancel={() => setConfirm(false)} />}
    </div>
  );
}
