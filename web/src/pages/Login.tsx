import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, MapPin, Bell, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { Field } from '../components/ui';
import { HERO, LOGO_WHITE, LOGO_MARK } from '../lib/images';

export function Login() {
  const { user, login, loading } = useAuth();
  const settings = useSettings();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-split">
      <aside className="login-hero" style={{ backgroundImage: `url(${HERO})` }}>
        <div className="login-hero-content">
          <img src={LOGO_WHITE} alt={settings.company_name} className="login-logo" />
          <h1>Seu veículo sempre ao alcance.</h1>
          <p>Localização em tempo real, histórico de rotas, alertas inteligentes e bloqueio remoto — no computador e no celular.</p>
          <ul className="login-features">
            <li><MapPin size={18} /> Mapa ao vivo com todos os veículos</li>
            <li><Bell size={18} /> Alertas de ignição, velocidade e cercas</li>
            <li><Lock size={18} /> Bloqueio do motor pelo painel</li>
            <li><ShieldCheck size={18} /> Acesso individual por cliente</li>
          </ul>
        </div>
      </aside>
      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="brand">
            <img src={LOGO_MARK} alt="" className="logo-img" style={{ width: 44, height: 44 }} />
            <div>
              <h1>{settings.company_name}</h1>
              <div className="small muted">Entre para acompanhar seus veículos</div>
            </div>
          </div>
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Senha">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <div className="alert danger mb">{error}</div>}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="tiny muted mt" style={{ textAlign: 'center' }}>
            Esqueceu a senha? Fale com o administrador da sua conta.
          </p>
        </form>
      </main>
    </div>
  );
}
