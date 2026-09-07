import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { SettingsProvider } from './lib/settings';
import { ToastProvider, Loading } from './components/ui';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LiveMap } from './pages/LiveMap';
import { History } from './pages/History';
import { Reports } from './pages/Reports';
import { Events } from './pages/Events';
import { Geofences } from './pages/Geofences';
import { Commands } from './pages/Commands';
import { Clients } from './pages/Clients';
import { Vehicles } from './pages/Vehicles';
import { Devices } from './pages/Devices';
import { UsersPage } from './pages/Users';
import { SettingsPage } from './pages/Settings';
import { Help } from './pages/Help';

function Protected({ staff, admin }: { staff?: boolean; admin?: boolean }) {
  const { user, loading, isStaff, isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<Protected />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/mapa" element={<LiveMap />} />
                <Route path="/historico" element={<History />} />
                <Route path="/relatorios" element={<Reports />} />
                <Route path="/alertas" element={<Events />} />
                <Route path="/cercas" element={<Geofences />} />
                <Route path="/comandos" element={<Commands />} />
                <Route path="/ajuda" element={<Help />} />
              </Route>
              <Route element={<Protected staff />}>
                <Route path="/clientes" element={<Clients />} />
                <Route path="/veiculos" element={<Vehicles />} />
                <Route path="/rastreadores" element={<Devices />} />
                <Route path="/configuracoes" element={<SettingsPage />} />
              </Route>
              <Route element={<Protected admin />}>
                <Route path="/usuarios" element={<UsersPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
