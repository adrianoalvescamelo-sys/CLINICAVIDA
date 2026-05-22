/**
 * UsuariosListPage — listagem + status + links
 *
 * Cobre:
 *  - loading
 *  - empty state
 *  - render tabela: nome, email, perfil legível, status, último login
 *  - links Editar e Trocar senha
 *  - traço quando ultimoLoginEm é null
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import UsuariosListPage from './UsuariosListPage';
import * as usuariosApi from '../api/usuarios';
import { useAuthStore } from '../store/auth';
import type { Usuario } from '../types/usuario';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <UsuariosListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseUser: Usuario = {
  id: 'u-1',
  email: 'alice@clinica.com',
  nomeCompleto: 'Alice Silva',
  perfil: 'RECEPCAO',
  ativo: true,
  tentativasLogin: 0,
  bloqueadoAte: null,
  ultimoLoginEm: '2026-05-15T10:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('UsuariosListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: { id: 'a', email: 'admin@x', nomeCompleto: 'Admin', perfil: 'ADMIN' },
    });
  });

  it('exibe loading', () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('empty state', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/nenhum usuário cadastrado/i, {}, { timeout: 3000 });
  });

  it('renderiza tabela com perfil legível "Recepção"', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([baseUser]);
    renderPage();
    await screen.findByText('Alice Silva', {}, { timeout: 3000 });
    expect(screen.getByText('alice@clinica.com')).toBeInTheDocument();
    expect(screen.getByText('Recepção')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('mostra Inativo quando ativo=false', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([
      { ...baseUser, ativo: false },
    ]);
    renderPage();
    await screen.findByText('Inativo', {}, { timeout: 3000 });
  });

  it('último login null vira traço', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([
      { ...baseUser, ultimoLoginEm: null },
    ]);
    renderPage();
    await screen.findByText('Alice Silva', {}, { timeout: 3000 });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('link Editar aponta para /usuarios/:id', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([baseUser]);
    renderPage();
    const link = await screen.findByRole('link', { name: /editar/i });
    expect(link).toHaveAttribute('href', `/usuarios/${baseUser.id}`);
  });

  it('link Trocar senha aponta para /usuarios/:id/senha', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([baseUser]);
    renderPage();
    const link = await screen.findByRole('link', { name: /trocar senha/i });
    expect(link).toHaveAttribute('href', `/usuarios/${baseUser.id}/senha`);
  });

  it('link "+ Novo usuário" aponta para /usuarios/novo', async () => {
    vi.spyOn(usuariosApi, 'listUsuarios').mockResolvedValue([]);
    renderPage();
    const link = await screen.findByRole('link', { name: /novo usuário/i });
    expect(link).toHaveAttribute('href', '/usuarios/novo');
  });
});
