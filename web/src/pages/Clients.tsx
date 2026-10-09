import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import type { Client } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Badge, Confirm, Empty, Field, Loading, Modal, useToast } from '../components/ui';
import { fmtDate } from '../lib/format';

const empty = { name: '', document: '', phone: '', email: '', address: '', notes: '', active: true };

export function Clients() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<(typeof empty & { id?: number }) | null>(null);
  const [del, setDel] = useState<Client | null>(null);
  const [userFor, setUserFor] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Client[]>('/api/clients', { search }).then(setClients).catch((e) => toast('error', e.message));
  useEffect(() => {
    load();
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { ...editing, email: editing.email || null };
      if (editing.id) await api.put(`/api/clients/${editing.id}`, body);
      else await api.post('/api/clients', body);
      toast('success', 'Cliente salvo');
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
    try {
      await api.delete(`/api/clients/${del.id}`);
      toast('success', 'Cliente excluído');
      setDel(null);
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Buscar por nome, documento, e-mail ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn primary" onClick={() => setEditing({ ...empty })}>
          <Plus size={16} /> Novo cliente
        </button>
      </div>
      <div className="card">
        <div className="card-body tight">
          {!clients ? (
            <Loading />
          ) : !clients.length ? (
            <Empty text="Nenhum cliente cadastrado" icon={<Users size={34} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Veículos</th>
                    <th>Rastreadores</th>
                    <th>Acessos</th>
                    <th>Status</th>
                    <th>Desde</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="strong">{c.name}</div>
                        <div className="tiny muted">{c.document}</div>
                      </td>
                      <td className="small">
                        <div>{c.phone}</div>
                        <div className="muted">{c.email}</div>
                      </td>
                      <td>{c.vehicles_count}</td>
                      <td>{c.devices_count}</td>
                      <td>{c.users_count}</td>
                      <td><Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Ativo' : 'Inativo'}</Badge></td>
                      <td className="small muted">{fmtDate(c.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm ghost icon" title="Criar acesso do cliente" onClick={() => setUserFor(c)}><UserPlus size={15} /></button>
                        <button className="btn sm ghost icon" title="Editar" onClick={() => setEditing({ id: c.id, name: c.name, document: c.document ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '', active: !!c.active })}><Pencil size={15} /></button>
                        {isAdmin && <button className="btn sm ghost icon" title="Excluir" onClick={() => setDel(c)}><Trash2 size={15} /></button>}
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
          title={editing.id ? 'Editar cliente' : 'Novo cliente'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy || editing.name.length < 2} onClick={save}>Salvar</button>
            </>
          }
        >
          <Field label="Nome / Razão social"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
          <div className="grid cols-2">
            <Field label="CPF / CNPJ"><input className="input" value={editing.document} onChange={(e) => setEditing({ ...editing, document: e.target.value })} /></Field>
            <Field label="Telefone / WhatsApp"><input className="input" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
          </div>
          <Field label="E-mail"><input className="input" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
          <Field label="Endereço"><input className="input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
          <Field label="Observações"><textarea className="textarea" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          <label className="checkbox"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Cliente ativo</label>
        </Modal>
      )}
      {del && <Confirm title="Excluir cliente" danger message={`Excluir "${del.name}"? Todos os veículos, cercas, eventos e acessos deste cliente serão removidos.`} onConfirm={remove} onCancel={() => setDel(null)} />}
      {userFor && <ClientUserModal client={userFor} onClose={() => { setUserFor(null); load(); }} />}
    </div>
  );
}

export function ClientUserModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: client.email ?? '', password: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/api/users', { ...form, role: 'client', clientId: client.id });
      toast('success', `Acesso criado para ${form.email}`);
      onClose();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Novo acesso — ${client.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || !form.name || !form.email || form.password.length < 6} onClick={save}>Criar acesso</button>
        </>
      }
    >
      <p className="small muted mb">O cliente usará este e-mail e senha para entrar na plataforma e ver apenas os veículos dele.</p>
      <Field label="Nome"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
      <Field label="E-mail (login)"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Senha" hint="Mínimo de 6 caracteres"><input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
    </Modal>
  );
}
