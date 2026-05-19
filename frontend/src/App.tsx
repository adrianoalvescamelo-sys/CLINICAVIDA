import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PacientesListPage from './pages/PacientesListPage';
import PacienteNovoPage from './pages/PacienteNovoPage';
import PacienteEditarPage from './pages/PacienteEditarPage';
import ProfissionaisListPage from './pages/ProfissionaisListPage';
import ProfissionalNovoPage from './pages/ProfissionalNovoPage';
import ProfissionalEditarPage from './pages/ProfissionalEditarPage';
import AgendaPage from './pages/AgendaPage';
import AgendaNovoPage from './pages/AgendaNovoPage';
import WhatsappPendentesPage from './pages/WhatsappPendentesPage';
import RecepcaoPage from './pages/RecepcaoPage';
import PainelTVPage from './pages/PainelTVPage';
import RelatoriosPage from './pages/RelatoriosPage';
import { useAuthStore } from './store/auth';
import RoleRoute from './components/RoleRoute';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
      <Route path="/agenda" element={<PrivateRoute><AgendaPage /></PrivateRoute>} />
      <Route path="/recepcao" element={<PrivateRoute><RecepcaoPage /></PrivateRoute>} />
      <Route path="/pacientes" element={<PrivateRoute><PacientesListPage /></PrivateRoute>} />
      <Route path="/painel-tv" element={<PrivateRoute><PainelTVPage /></PrivateRoute>} />
      <Route path="/profissionais" element={<PrivateRoute><ProfissionaisListPage /></PrivateRoute>} />

      <Route
        path="/pacientes/novo"
        element={<RoleRoute allow={['ADMIN', 'RECEPCAO']}><PacienteNovoPage /></RoleRoute>}
      />
      <Route path="/pacientes/:id" element={<PrivateRoute><PacienteEditarPage /></PrivateRoute>} />
      <Route
        path="/profissionais/novo"
        element={<RoleRoute allow={['ADMIN']}><ProfissionalNovoPage /></RoleRoute>}
      />
      <Route
        path="/profissionais/:id"
        element={<RoleRoute allow={['ADMIN']}><ProfissionalEditarPage /></RoleRoute>}
      />
      <Route
        path="/agenda/novo"
        element={<RoleRoute allow={['ADMIN', 'RECEPCAO']}><AgendaNovoPage /></RoleRoute>}
      />
      <Route
        path="/whatsapp"
        element={<RoleRoute allow={['ADMIN', 'RECEPCAO']}><WhatsappPendentesPage /></RoleRoute>}
      />
      <Route
        path="/relatorios"
        element={<RoleRoute allow={['ADMIN', 'RECEPCAO']}><RelatoriosPage /></RoleRoute>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
