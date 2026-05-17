/**
 * PacientesListPage — busca + paginação + render
 *
 * Cobre:
 *  - loading state
 *  - empty state quando sem itens
 *  - renderiza tabela formatada (CPF + telefone)
 *  - busca: digitar reseta página para 1
 *  - paginação: anterior/próxima
 *  - link "Editar" aponta para /pacientes/:id
 *  - link "+ Novo paciente"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PacientesListPage from './PacientesListPage';
import * as pacientesApi from '../api/pacientes';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PacientesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  cpf: '12345678901',
  nomeCompleto: 'Maria Silva',
  dataNascimento: '1985-04-20T00:00:00.000Z',
  telefoneWhatsapp: '65999991111',
};

describe('PacientesListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe loading state', () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('empty state quando sem itens', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [],
      total: 0,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText(/nenhum paciente encontrado/i, {}, { timeout: 3000 });
  });

  it('renderiza tabela com CPF e telefone formatados', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [baseItem],
      total: 1,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText('Maria Silva', {}, { timeout: 3000 });
    expect(screen.getByText('123.456.789-01')).toBeInTheDocument();
    expect(screen.getByText('(65) 99999-1111')).toBeInTheDocument();
  });

  it('formato telefone fixo 10 dígitos', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [{ ...baseItem, telefoneWhatsapp: '6533334444' }],
      total: 1,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText('(65) 3333-4444', {}, { timeout: 3000 });
  });

  it('busca: passa q para API + reseta pagina para 1', async () => {
    const apiMock = vi
      .spyOn(pacientesApi, 'listPacientes')
      .mockResolvedValue({
        itens: [],
        total: 0,
      } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText(/nenhum paciente encontrado/i, {}, { timeout: 3000 });

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: 'Silva' },
    });

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Silva', pagina: 1 }),
      );
    });
  });

  it('paginação: botão Anterior desabilitado em página 1', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [baseItem],
      total: 100,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText('Maria Silva', {}, { timeout: 3000 });

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /próxima/i })).not.toBeDisabled();
  });

  it('paginação: clicar Próxima incrementa página', async () => {
    const apiMock = vi
      .spyOn(pacientesApi, 'listPacientes')
      .mockResolvedValue({
        itens: [baseItem],
        total: 100,
      } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    await screen.findByText('Maria Silva', {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        expect.objectContaining({ pagina: 2 }),
      );
    });
  });

  it('link "Editar" tem href /pacientes/:id', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [baseItem],
      total: 1,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    const link = await screen.findByRole('link', { name: /editar/i });
    expect(link).toHaveAttribute('href', `/pacientes/${baseItem.id}`);
  });

  it('link "Novo paciente" tem href /pacientes/novo', async () => {
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [],
      total: 0,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);

    renderPage();

    const link = await screen.findByRole('link', { name: /novo paciente/i });
    expect(link).toHaveAttribute('href', '/pacientes/novo');
  });
});
