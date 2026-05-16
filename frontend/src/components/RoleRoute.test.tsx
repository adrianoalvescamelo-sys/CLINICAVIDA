import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoleRoute from './RoleRoute';
import { useAuthStore, type AuthUser } from '../store/auth';

function Protected() {
  return <div data-testid="protected">CONTEUDO_RESTRITO</div>;
}

function LoginPage() {
  return <div data-testid="login">LOGIN_PAGE</div>;
}

function Home() {
  return <div data-testid="home">HOME_PAGE</div>;
}

function renderAt(path: string, allow: AuthUser['perfil'][]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Home />} />
        <Route
          path="/restrito"
          element={
            <RoleRoute allow={allow}>
              <Protected />
            </RoleRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const makeUser = (perfil: AuthUser['perfil']): AuthUser => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@clinicavida.local',
  nomeCompleto: 'Test User',
  perfil,
});

describe('RoleRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, refreshToken: null, user: null });
  });

  it('redireciona para /login quando sem token', () => {
    renderAt('/restrito', ['ADMIN']);

    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('redireciona para / quando token presente mas user null', () => {
    useAuthStore.setState({
      token: 'tok-1',
      refreshToken: 'ref-1',
      user: null,
    });

    renderAt('/restrito', ['ADMIN']);

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('redireciona para / quando perfil não está em allow', () => {
    useAuthStore.setState({
      token: 'tok-1',
      refreshToken: 'ref-1',
      user: makeUser('MEDICO'),
    });

    renderAt('/restrito', ['ADMIN', 'RECEPCAO']);

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('renderiza children quando perfil está em allow (ADMIN)', () => {
    useAuthStore.setState({
      token: 'tok-1',
      refreshToken: 'ref-1',
      user: makeUser('ADMIN'),
    });

    renderAt('/restrito', ['ADMIN', 'RECEPCAO']);

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renderiza children quando perfil está em allow (RECEPCAO)', () => {
    useAuthStore.setState({
      token: 'tok-1',
      refreshToken: 'ref-1',
      user: makeUser('RECEPCAO'),
    });

    renderAt('/restrito', ['ADMIN', 'RECEPCAO']);

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('bloqueia PROFISSIONAL_NAO_MEDICO em rota só de ADMIN', () => {
    useAuthStore.setState({
      token: 'tok-1',
      refreshToken: 'ref-1',
      user: makeUser('PROFISSIONAL_NAO_MEDICO'),
    });

    renderAt('/restrito', ['ADMIN']);

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});
