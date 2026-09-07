import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Car, Users, Radio, Route, Bell, Shapes, TerminalSquare, Settings, LogOut, Menu, MapPin, FileBarChart2, UserCog, KeyRound, LifeBuoy, MoreHorizontal, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { Modal, Field, useToast } from './ui';
import { LOGO_MARK } from '../lib/images';

const TITLES: Record<string, string> = {
  '/': 'Painel',
  '/mapa': 'Mapa ao vivo',
  '/historico': 'Histórico de rotas',
  '/relatorios': 'Relatórios',
  '/alertas': 'Alertas',
  '/cercas': 'Cercas virtuais',
  '/comandos': 'Comandos',
  '/veiculos': 'Veículos',
  '/clientes': 'Clientes',
  '/rastreadores': 'Rastreadores',
  '/usuarios': 'Usuários',
  '/configuracoes': 'Configurações',
  '/ajuda': 'Ajuda e tutoriais',
};

export function Layout() {
  const { user, logout, isStaff, isAdmin } = useAuth();
  const settings = useSettings();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<{ count: number; critical: number }>({ count: 0, critical: 0 });
  const [pending, setPending] = useState(0);
  const [pwd, setPwd] = useState(false);

  const refreshCounters = () => {
    api.get<{ count: number; critical: number }>('/api/events/unread').then(setUnread).catch(() => {});
    if (isStaff) api.get<{ status: string }[]>('/api/devices', { status: 'pending' }).then((d) => setPending(d.length)).catch(() => {});
  };
  useEffect(refreshCounters, [loc.pathname, isStaff]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((m) => {
    if (m.type === 'event' && m.data?.severity !== 'info') setUnread((u) => ({ count: u.count + 1, critical: u.critical + (m.data.severity === 'critical' ? 1 : 0) }));
    if (m.type === 'device' && m.data?.new) setPending((p) => p + 1);
  });
  useEffect(() => setOpen(false), [loc.pathname]);

  const title = TITLES[loc.pathname] ?? settings.company_name;
  const flush = loc.pathname === '/mapa' || loc.pathname === '/historico' || loc.pathname === '/cercas';

  const Item = ({ to, icon, label, badge, badgeTone }: { to: string; icon: ReactNode; label: string; badge?: number; badgeTone?: string }) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      {icon}
      <span>{label}</span>
      {badge ? <span className={`badge ${badgeTone ?? 'danger'}`}>{badge}</span> : null}
    </NavLink>
  );

  const Tab = ({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
      <span className="tab-icon">
        {icon}
        {badge ? <span className="tab-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </span>
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="app">
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src={LOGO_MARK} alt="" className="logo-img" />
          <span className="truncate">{settings.company_name}</span>
          <button className="btn ghost icon close-menu" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          <div className="nav-section">Monitoramento</div>
          <Item to="/" icon={<LayoutDashboard size={18} />} label="Painel" />
          <Item to="/mapa" icon={<MapPin size={18} />} label="Mapa ao vivo" />
          <Item to="/historico" icon={<Route size={18} />} label="Histórico de rotas" />
          <Item to="/relatorios" icon={<FileBarChart2 size={18} />} label="Relatórios" />
          <Item to="/alertas" icon={<Bell size={18} />} label="Alertas" badge={unread.count} badgeTone={unread.critical ? 'danger' : 'warning'} />
          <Item to="/cercas" icon={<Shapes size={18} />} label="Cercas virtuais" />
          <Item to="/comandos" icon={<TerminalSquare size={18} />} label="Comandos" />
          {isStaff && (
            <>
              <div className="nav-section">Administração</div>
              <Item to="/clientes" icon={<Users size={18} />} label="Clientes" />
              <Item to="/veiculos" icon={<Car size={18} />} label="Veículos" />
              <Item to="/rastreadores" icon={<Radio size={18} />} label="Rastreadores" badge={pending} badgeTone="warning" />
              {isAdmin && <Item to="/usuarios" icon={<UserCog size={18} />} label="Usuários" />}
              <Item to="/configuracoes" icon={<Settings size={18} />} label="Configurações" />
            </>
          )}
          <div className="nav-section">Suporte</div>
          <Item to="/ajuda" icon={<LifeBuoy size={18} />} label="Ajuda e tutoriais" />
        </nav>
        <div className="user-box">
          <div className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="name truncate">{user?.name}</div>
            <div className="role truncate">{user?.role === 'admin' ? 'Administrador' : user?.role === 'operator' ? 'Operador' : user?.client?.name ?? 'Cliente'}</div>
          </div>
          <button className="btn ghost icon" title="Alterar senha" onClick={() => setPwd(true)} style={{ color: '#94a3b8' }}>
            <KeyRound size={16} />
          </button>
          <button className="btn ghost icon" title="Sair" onClick={logout} style={{ color: '#94a3b8' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <img src={LOGO_MARK} alt="" className="topbar-logo" />
          <span className="title">{title}</span>
          <span className="spacer" />
          <span className="small muted hide-mobile">{user?.client?.name ?? (user?.role === 'admin' ? 'Acesso total' : '')}</span>
        </header>
        <main className={`content ${flush ? 'flush' : ''}`}>
          <Outlet />
        </main>
        <nav className="tabbar">
          <Tab to="/" icon={<LayoutDashboard size={22} />} label="Painel" />
          <Tab to="/mapa" icon={<MapPin size={22} />} label="Mapa" />
          <Tab to="/historico" icon={<Route size={22} />} label="Rotas" />
          <Tab to="/alertas" icon={<Bell size={22} />} label="Alertas" badge={unread.count} />
          <button className="tab-item" onClick={() => setOpen(true)}>
            <span className="tab-icon">
              <MoreHorizontal size={22} />
              {pending ? <span className="tab-badge">{pending}</span> : null}
            </span>
            <span>Mais</span>
          </button>
        </nav>
      </div>
      {pwd && <ChangePassword onClose={() => setPwd(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: cur, newPassword: nw });
      toast('success', 'Senha alterada');
      onClose();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Alterar senha"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || nw.length < 6} onClick={submit}>Salvar</button>
        </>
      }
    >
      <Field label="Senha atual">
        <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Field label="Nova senha" hint="Mínimo de 6 caracteres">
        <input className="input" type="password" value={nw} onChange={(e) => setNw(e.target.value)} />
      </Field>
    </Modal>
  );
}
