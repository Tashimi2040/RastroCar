import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UserCog } from 'lucide-react';
import { api } from '../lib/api';
import type { Client } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Badge, Confirm, Empty, Field, Loading, Modal, useToast } from '../components/ui';
import { fmtRelative } from '../lib/format';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'client';
  client_id: number | null;
  client_name: string | null;
  active: number;
  last_login_at: number | null;
}
interface Form {
  id?: number;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'operator' | 'client';
  clientId: number;
  active: boolean;
}
const ROLE: Record<string, string> = { admin: 'Administrador', operator: 'Operador', client: 'Cliente' };

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Form | null>(null);
  const [del, setDel] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<UserRow[]>('/api/users').then(setUsers);
  useEffect(() => {
    load();
    api.get<Client[]>('/api/clients').then(setClients);
  }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body: any = { name: editing.name, email: editing.email, role: editing.role, clientId: editing.role === 'client' ? editing.clientId : null, active: editing.active };
      if (editing.password) body.password = editing.password;
      if (editing.id) await api.put(`/api/users/${editing.id}`, body);
      else await api.post('/api/users', body);
      toast('success', 'Usuário salvo');
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
      await api.delete(`/api/users/${del.id}`);
      toast('success', 'Usuário excluído');
      setDel(null);
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <span className="muted small">Administradores têm acesso total. Operadores gerenciam clientes, veículos e rastreadores. Clientes veem apenas seus veículos.</span>
        <button className="btn primary" onClick={() => setEditing({ name: '', email: '', password: '', role: 'client', clientId: clients[0]?.id ?? 0, active: true })}>
          <Plus size={16} /> Novo usuário
        </button>
      </div>
      <div className="card">
        <div className="card-body tight">
          {!users ? (
            <Loading />
          ) : !users.length ? (
            <Empty text="Nenhum usuário" icon={<UserCog size={34} />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Último acesso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="strong">{u.name}</td>
                      <td>{u.email}</td>
                      <td><Badge tone={u.role === 'admin' ? 'primary' : u.role === 'operator' ? 'info' : 'neutral'}>{ROLE[u.role]}</Badge></td>
                      <td>{u.client_name ?? '—'}</td>
                      <td><Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Ativo' : 'Inativo'}</Badge></td>
                      <td className="small muted">{fmtRelative(u.last_login_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm ghost icon" onClick={() => setEditing({ id: u.id, name: u.name, email: u.email, password: '', role: u.role, clientId: u.client_id ?? 0, active: !!u.active })}><Pencil size={15} /></button>
                        {u.id !== me?.id && <button className="btn sm ghost icon" onClick={() => setDel(u)}><Trash2 size={15} /></button>}
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
          title={editing.id ? 'Editar usuário' : 'Novo usuário'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy || !editing.name || !editing.email || (!editing.id && editing.password.length < 6)} onClick={save}>Salvar</button>
            </>
          }
        >
          <Field label="Nome"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
          <Field label={editing.id ? 'Nova senha (deixe vazio para manter)' : 'Senha'} hint="Mínimo de 6 caracteres"><input className="input" type="text" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></Field>
          <Field label="Perfil">
            <select className="select" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Form['role'] })}>
              <option value="client">Cliente</option>
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </Field>
          {editing.role === 'client' && (
            <Field label="Cliente">
              <select className="select" value={editing.clientId} onChange={(e) => setEditing({ ...editing, clientId: Number(e.target.value) })}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
          <label className="checkbox"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativo</label>
        </Modal>
      )}
      {del && <Confirm title="Excluir usuário" danger message={`Excluir o usuário ${del.email}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
