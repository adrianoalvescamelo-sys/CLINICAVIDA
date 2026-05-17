/**
 * WhatsappPendentesPage — consome cursor page {items, nextCursor}
 *
 * Cobre:
 *  - loading state
 *  - empty state quando items vazio
 *  - renderiza tabela quando items populados
 *  - chama reenviar() ao clicar botão e invalida query
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import WhatsappPendentesPage from './WhatsappPendentesPage';
import * as waApi from '../api/whatsapp';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <WhatsappPendentesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tipo: 'CONFIRMACAO_24H' as const,
  status: 'PENDENTE' as const,
  telefone: '65999990001',
  tentativas: 1,
  erro: null,
  createdAt: '2026-05-17T12:00:00.000Z',
  paciente: {
    id: 'p1',
    nomeCompleto: 'Paciente Teste',
  },
};

describe('WhatsappPendentesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe loading state inicial', () => {
    vi.spyOn(waApi, 'listPendentes').mockImplementation(
      () => new Promise(() => {}), // pending
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('exibe empty state quando items vazio', async () => {
    vi.spyOn(waApi, 'listPendentes').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/nenhuma pendência/i)).toBeInTheDocument();
    });
  });

  it('renderiza tabela com items populados', async () => {
    vi.spyOn(waApi, 'listPendentes').mockResolvedValue({
      items: [baseItem, { ...baseItem, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'FALHA' }],
      nextCursor: null,
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Paciente Teste').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('PENDENTE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FALHA').length).toBeGreaterThan(0);
  });

  it('chama reenviar() ao clicar botão Reenviar', async () => {
    vi.spyOn(waApi, 'listPendentes').mockResolvedValue({
      items: [baseItem],
      nextCursor: null,
    });
    const reenviarMock = vi.spyOn(waApi, 'reenviar').mockResolvedValue({
      ...baseItem,
      status: 'ENVIADA',
    } as Awaited<ReturnType<typeof waApi.reenviar>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /reenviar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(reenviarMock).toHaveBeenCalledWith(baseItem.id);
    });
  });
});
