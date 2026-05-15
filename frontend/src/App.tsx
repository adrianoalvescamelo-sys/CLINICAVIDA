import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PacientesListPage from './pages/PacientesListPage';
import PacienteNovoPage from './pages/PacienteNovoPage';
import PacienteEditarPage from './pages/PacienteEditarPage';
import AgendaPage from './pages/AgendaPage';
import AgendaNovoPage from './pages/AgendaNovoPage';
import WhatsappPendentesPage from './pages/WhatsappPendentesPage';
import RecepcaoPage from './pages/RecepcaoPage';
import PainelTVPage from './pages/PainelTVPage';
import RelatoriosPage from './pages/RelatoriosPage';
import { useAuthStore } from './store/auth';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/pacientes"
        element={
          <PrivateRoute>
            <PacientesListPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/pacientes/novo"
        element={
          <PrivateRoute>
            <PacienteNovoPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/pacientes/:id"
        element={
          <PrivateRoute>
            <PacienteEditarPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/agenda"
        element={
          <PrivateRoute>
            <AgendaPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/agenda/novo"
        element={
          <PrivateRoute>
            <AgendaNovoPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/whatsapp"
        element={
          <PrivateRoute>
            <WhatsappPendentesPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/recepcao"
        element={
          <PrivateRoute>
            <RecepcaoPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/painel-tv"
        element={
          <PrivateRoute>
            <PainelTVPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/relatorios"
        element={
          <PrivateRoute>
            <RelatoriosPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
