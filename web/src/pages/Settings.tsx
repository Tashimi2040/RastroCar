import { useEffect, useState } from 'react';
import { Save, Server, Smartphone, Map, Route, Bell } from 'lucide-react';
import { api } from '../lib/api';
import type { Settings, Dashboard } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useReloadSettings } from '../lib/settings';
import { Field, Loading, useToast, useAsync, Badge } from '../components/ui';
import { SetupModal } from './Devices';
import { fmtRelative } from '../lib/format';

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const reloadPublic = useReloadSettings();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const { data: dash, reload } = useAsync(() => api.get<Dashboard>('/api/dashboard'), []);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(setS).catch((e) => toast('error', e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  if (!s) return <Loading />;
  const set = (k: keyof Settings, v: unknown) => setS({ ...s, [k]: v } as Settings);
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));

  const save = async () => {
    setBusy(true);
    try {
      const { env, ...body } = s as any;
      delete body.defaults;
      const r = await api.put<Settings>('/api/settings', body);
      setS({ ...r, env });
      reloadPublic();
      toast('success', 'Configurações salvas');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="grid cols-2">
        <div className="card">
          <div className="card-header">
            <h2><Server size={16} /> Servidor de rastreadores</h2>
            <Badge tone="success">Gateway ativo</Badge>
          </div>
          <div className="card-body">
            <div className="alert info mb small">
              Os rastreadores precisam ser apontados (por SMS) para o endereço público deste servidor e a porta TCP abaixo. A porta precisa estar liberada no firewall/roteador e no provedor de hospedagem.
            </div>
            <Field label="Endereço público (IP fixo ou domínio)" hint="Ex.: rastreio.suaempresa.com.br ou 187.10.20.30. Usado nas instruções de configuração enviadas por SMS.">
              <input className="input mono" value={s.public_host} onChange={(e) => set('public_host', e.target.value.trim())} disabled={!isAdmin} placeholder="rastreio.suaempresa.com.br" />
            </Field>
            <Field label="Porta TCP" hint={`Porta em que o gateway está ouvindo (variável TCP_PORT = ${s.env?.tcpPort ?? s.tcp_port}). Aceita GT06, H02 e TK103 na mesma porta com detecção automática.`}>
              <input className="input mono" type="number" value={s.tcp_port} onChange={num('tcp_port')} disabled={!isAdmin} />
            </Field>
            <Field label="Senha padrão dos rastreadores" hint="Usada em comandos que exigem senha (DYD/HFYD, ST-901). Padrão de fábrica costuma ser 123456 ou 0000.">
              <input className="input mono" value={s.device_default_password} onChange={(e) => set('device_default_password', e.target.value)} disabled={!isAdmin} />
            </Field>
            <button className="btn" onClick={() => setSetup(true)}>
              <Smartphone size={15} /> Ver instruções de configuração por SMS
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Conexões ativas</h2>
            <span className="small muted">{dash?.gateway?.connections ?? 0} conexão(ões) · {dash?.gateway?.wsClients ?? 0} painel(is) aberto(s)</span>
          </div>
          <div className="card-body tight">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>IMEI</th>
                    <th>Protocolo</th>
                    <th>IP</th>
                    <th>Conectado</th>
                    <th>Atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {!dash?.gateway?.sessions.length && (
                    <tr>
                      <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Nenhum rastreador conectado neste momento</td>
                    </tr>
                  )}
                  {dash?.gateway?.sessions.map((x) => (
                    <tr key={x.id}>
                      <td className="mono">{x.imei ?? <span className="muted">identificando…</span>}</td>
                      <td>{x.protocol?.toUpperCase() ?? '—'}</td>
                      <td className="mono">{x.ip}</td>
                      <td className="small">{fmtRelative(x.connectedAt)}</td>
                      <td className="small">{fmtRelative(x.lastActivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body small muted">
              <div>Banco de dados: <span className="mono">{s.env?.dbPath}</span></div>
              <div>Auto-registro de rastreadores desconhecidos: <strong>{s.env?.autoRegisterDevices ? 'ligado' : 'desligado'}</strong> (variável AUTO_REGISTER_DEVICES)</div>
              <div>Porta HTTP: <span className="mono">{s.env?.httpPort}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <div className="card-header"><h2><Map size={16} /> Mapa e empresa</h2></div>
          <div className="card-body">
            <Field label="Nome da empresa / plataforma"><input className="input" value={s.company_name} onChange={(e) => set('company_name', e.target.value)} disabled={!isAdmin} /></Field>
            <Field label="URL dos tiles do mapa (avançado)" hint="Os usuários escolhem o estilo no próprio mapa (Ruas, Satélite, Google). Este campo só é usado se você informar um provedor próprio, ex.: Mapbox/Google Maps Platform com sua chave.">
              <input className="input mono" value={s.map_tile_url} onChange={(e) => set('map_tile_url', e.target.value)} disabled={!isAdmin} />
            </Field>
            <Field label="Atribuição do mapa"><input className="input" value={s.map_attribution} onChange={(e) => set('map_attribution', e.target.value)} disabled={!isAdmin} /></Field>
            <div className="grid cols-3">
              <Field label="Centro (lat)"><input className="input" type="number" step="0.0001" value={s.map_center_lat} onChange={num('map_center_lat')} disabled={!isAdmin} /></Field>
              <Field label="Centro (lng)"><input className="input" type="number" step="0.0001" value={s.map_center_lng} onChange={num('map_center_lng')} disabled={!isAdmin} /></Field>
              <Field label="Zoom"><input className="input" type="number" value={s.map_zoom} onChange={num('map_zoom')} disabled={!isAdmin} /></Field>
            </div>
            <Field label="Fuso horário"><input className="input" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={!isAdmin} /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2><Route size={16} /> Mapeamento de rotas</h2></div>
          <div className="card-body">
            <Field label="Encerrar viagem após parado por (min)" hint="Sem movimento por este tempo, a viagem é fechada e uma parada é registrada.">
              <input className="input" type="number" value={s.trip_idle_timeout_min} onChange={num('trip_idle_timeout_min')} disabled={!isAdmin} />
            </Field>
            <Field label="Distância mínima de uma viagem (m)" hint="Deslocamentos menores são descartados como ruído de GPS.">
              <input className="input" type="number" value={s.trip_min_distance_m} onChange={num('trip_min_distance_m')} disabled={!isAdmin} />
            </Field>
            <Field label="Retenção de posições (dias)" hint="0 = manter para sempre. Viagens e eventos são mantidos.">
              <input className="input" type="number" value={s.positions_retention_days} onChange={num('positions_retention_days')} disabled={!isAdmin} />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={s.reverse_geocode} onChange={(e) => set('reverse_geocode', e.target.checked)} disabled={!isAdmin} /> Converter coordenadas em endereços (OpenStreetMap)
            </label>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2><Bell size={16} /> Alertas</h2></div>
          <div className="card-body">
            <Field label="Limite de velocidade padrão (km/h)" hint="Pode ser sobrescrito por veículo. 0 = desligado.">
              <input className="input" type="number" value={s.default_speed_limit} onChange={num('default_speed_limit')} disabled={!isAdmin} />
            </Field>
            <Field label="Considerar offline após (min)" hint="Sem comunicação por este tempo gera alerta de 'sem comunicação'.">
              <input className="input" type="number" value={s.offline_timeout_min} onChange={num('offline_timeout_min')} disabled={!isAdmin} />
            </Field>
          </div>
        </div>
      </div>
      {isAdmin && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={save} disabled={busy}>
            <Save size={15} /> Salvar configurações
          </button>
        </div>
      )}
      {setup && <SetupModal device={null} onClose={() => setSetup(false)} />}
    </div>
  );
}
