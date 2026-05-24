import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PacienteEditarPage from './PacienteEditarPage';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as pacientesApi from '../api/pacientes';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok',
    refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/pacientes/:id" element={<PacienteEditarPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PacienteEditarPage — abas RBAC', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pacientesApi, 'getPaciente').mockImplementation(() => new Promise(() => {}));
  });

  it('MEDICO vê abas Prontuário e Documentos', () => {
    setUser('MEDICO');
    renderAt('/pacientes/pac-1');
    expect(screen.getByRole('button', { name: 'Prontuário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('RECEPCAO não vê abas clínicas', () => {
    setUser('RECEPCAO');
    renderAt('/pacientes/pac-1');
    expect(screen.queryByRole('button', { name: 'Prontuário' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Documentos' })).not.toBeInTheDocument();
  });

  it('RECEPCAO forçando ?aba=prontuario cai em Dados', () => {
    setUser('RECEPCAO');
    renderAt('/pacientes/pac-1?aba=prontuario');
    expect(screen.queryByText('Prontuário')).not.toBeInTheDocument();
  });
});
