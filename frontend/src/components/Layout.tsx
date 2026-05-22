import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { logout } from '../api/auth';

export default function Layout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.perfil === 'ADMIN';
  const isRecepcao = user?.perfil === 'ADMIN' || user?.perfil === 'RECEPCAO';
  const podeBloquear =
    user?.perfil === 'ADMIN' ||
    user?.perfil === 'MEDICO' ||
    user?.perfil === 'PROFISSIONAL_NAO_MEDICO';
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignora */
    }
    clear();
    navigate('/login');
  }

  const linkStyle = (path: string): React.CSSProperties => ({
    padding: '8px 16px',
    textDecoration: 'none',
    borderRadius: 6,
    color: location.pathname.startsWith(path) ? '#0f766e' : '#475569',
    background: location.pathname.startsWith(path) ? '#ccfbf1' : 'transparent',
    fontWeight: 500,
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link
            to="/"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#0f766e',
              textDecoration: 'none',
            }}
          >
            Clínica Vida
          </Link>
          <nav style={{ display: 'flex', gap: 8 }}>
            <Link to="/pacientes" style={linkStyle('/pacientes')}>
              Pacientes
            </Link>
            <Link to="/profissionais" style={linkStyle('/profissionais')}>
              Profissionais
            </Link>
            <Link to="/agenda" style={linkStyle('/agenda')}>
              Agenda
            </Link>
            {podeBloquear && (
              <Link to="/bloqueios" style={linkStyle('/bloqueios')}>
                Bloqueios
              </Link>
            )}
            <Link to="/whatsapp" style={linkStyle('/whatsapp')}>
              WhatsApp
            </Link>
            <Link to="/recepcao" style={linkStyle('/recepcao')}>
              Recepcao
            </Link>
            {isRecepcao && (
              <Link to="/lista-espera" style={linkStyle('/lista-espera')}>
                Lista espera
              </Link>
            )}
            <Link to="/painel-tv" style={linkStyle('/painel-tv')}>
              Painel TV
            </Link>
            <Link to="/relatorios" style={linkStyle('/relatorios')}>
              Relatórios
            </Link>
            {isAdmin && (
              <Link to="/usuarios" style={linkStyle('/usuarios')}>
                Usuários
              </Link>
            )}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            to="/minha-conta"
            style={{
              fontSize: 13,
              color: '#0f766e',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            title="Minha conta"
          >
            {user?.nomeCompleto} · {user?.perfil}
          </Link>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 12px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
