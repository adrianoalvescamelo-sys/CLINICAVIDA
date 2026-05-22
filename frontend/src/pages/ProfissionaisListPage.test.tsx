/**
 * ProfissionaisListPage — render + filtro ativos + permissão admin
 *
 * Cobre:
 *  - loading + erro
 *  - empty state
 *  - render tabela com cor, nome, especialidade, conselho, tipo, status
 *  - filtro "Apenas ativos" passa params para API
 *  - link "+ Novo profissional" só aparece para ADMIN
 *  - link "Editar" só aparece para ADMIN
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProfissionaisListPage from './ProfissionaisListPage';
import * as profissionaisApi from '../api/profissionais';
import { useAuthStore } from '../store/auth';
import type { Profissional } from '../types/profissional';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ProfissionaisListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseProf: Profissional = {
  id: 'pr-1',
  nomeCompleto: 'Dr. Beta',
  especialidade: 'Cardiologia',
  registroConselho: 'CRM-MT 1234',
  ehMedico: true,
  ativo: true,
  usuarioId: null,
  cor: '#0f766e',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setUser(perfil: 'ADMIN' | 'RECEPCAO' | 'MEDICO') {
  useAuthStore.setState({
    token: 't',
    refreshToken: 'r',
    user: {
      id: 'u',
      email: 'x@y.com',
      nomeCompleto: 'X',
      perfil,
    },
  });
}

describe('ProfissionaisListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUser('ADMIN');
  });

  it('exibe loading state', () => {
    vi.spyOn(profissionaisApi, 'listProfissionais').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('empty state quando sem profissionais', async () => {
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/nenhum profissional cadastrado/i, {}, { timeout: 3000 });
  });

  it('renderiza tabela com dados do profissional', async () => {
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([baseProf]);
    renderPage();
    await screen.findByText('Dr. Beta', {}, { timeout: 3000 });
    expect(screen.getByText('Cardiologia')).toBeInTheDocument();
    expect(screen.getByText('CRM-MT 1234')).toBeInTheDocument();
    expect(screen.getByText('Médico')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('mostra "Profissional" quando não é médico', async () => {
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([
      { ...baseProf, ehMedico: false },
    ]);
    renderPage();
    await screen.findByText('Profissional', {}, { timeout: 3000 });
  });

  it('mostra Inativo quando ativo=false', async () => {
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([
      { ...baseProf, ativo: false },
    ]);
    renderPage();
    await screen.findByText('Inativo', {}, { timeout: 3000 });
  });

  it('toggle "Apenas ativos" passa parametro para API', async () => {
    const mock = vi
      .spyOn(profissionaisApi, 'listProfissionais')
      .mockResolvedValue([baseProf]);
    renderPage();
    await screen.findByText('Dr. Beta', {}, { timeout: 3000 });
    expect(mock).toHaveBeenCalledWith({ ativos: true });

    fireEvent.click(screen.getByLabelText(/apenas ativos/i));
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith({ ativos: false });
    });
  });

  it('ADMIN vê botão "+ Novo profissional" e link "Editar"', async () => {
    setUser('ADMIN');
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([baseProf]);
    renderPage();
    await screen.findByText('Dr. Beta', {}, { timeout: 3000 });
    expect(screen.getByRole('link', { name: /novo profissional/i })).toHaveAttribute(
      'href',
      '/profissionais/novo',
    );
    expect(screen.getByRole('link', { name: /editar/i })).toHaveAttribute(
      'href',
      `/profissionais/${baseProf.id}`,
    );
  });

  it('RECEPCAO NÃO vê botão "+ Novo profissional" nem "Editar"', async () => {
    setUser('RECEPCAO');
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([baseProf]);
    renderPage();
    await screen.findByText('Dr. Beta', {}, { timeout: 3000 });
    expect(screen.queryByRole('link', { name: /novo profissional/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /editar/i })).toBeNull();
  });
});
