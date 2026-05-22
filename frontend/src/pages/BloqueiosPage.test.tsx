/**
 * BloqueiosPage — criação + listagem + remoção de bloqueios de agenda
 *
 * Cobre:
 *  - render listagem
 *  - empty state
 *  - validação client: campos faltando
 *  - validação client: fim <= início
 *  - sucesso criar chama API com ISO
 *  - remover usa window.confirm
 *  - mensagem permissão muda para MEDICO
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BloqueiosPage from './BloqueiosPage';
import * as agendaApi from '../api/agenda';
import * as profissionaisApi from '../api/profissionais';
import { useAuthStore } from '../store/auth';
import type { Bloqueio } from '../api/agenda';
import type { Profissional } from '../types/profissional';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <BloqueiosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseProf: Profissional = {
  id: 'pr-1',
  nomeCompleto: 'Dr. Beta',
  especialidade: 'Cardiologia',
  registroConselho: null,
  ehMedico: true,
  ativo: true,
  usuarioId: null,
  cor: '#0f766e',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const baseBloq: Bloqueio = {
  id: 'bq-1',
  profissionalId: 'pr-1',
  dataHoraInicio: '2026-05-20T12:00:00.000Z',
  dataHoraFim: '2026-05-20T13:00:00.000Z',
  motivo: 'Almoço',
  createdAt: '2026-05-19T00:00:00.000Z',
  profissional: {
    id: 'pr-1',
    nomeCompleto: 'Dr. Beta',
    especialidade: 'Cardiologia',
  },
};

describe('BloqueiosPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: { id: 'a', email: 'a@x', nomeCompleto: 'Admin', perfil: 'ADMIN' },
    });
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([baseProf]);
  });

  it('render mostra mensagem admin', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/bloquear qualquer profissional/i, {}, { timeout: 3000 });
  });

  it('mensagem permissão muda para MEDICO', async () => {
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: { id: 'm', email: 'm@x', nomeCompleto: 'Dr', perfil: 'MEDICO' },
    });
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/sua própria agenda/i, {}, { timeout: 3000 });
  });

  it('empty state na listagem', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/nenhum bloqueio cadastrado/i, {}, { timeout: 3000 });
  });

  it('render lista com profissional + datas + motivo', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([baseBloq]);
    renderPage();
    await screen.findByText('Almoço', {}, { timeout: 3000 });
    expect(screen.getAllByText('Dr. Beta').length).toBeGreaterThan(0);
  });

  it('validação client: campos obrigatórios', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    const criarMock = vi.spyOn(agendaApi, 'criarBloqueio');
    renderPage();
    await screen.findByText(/nenhum bloqueio/i, {}, { timeout: 3000 });
    // Submit form vazio — HTML5 required impede; usar fireEvent.submit no form
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('sucesso criar com ISO strings', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    const criarMock = vi
      .spyOn(agendaApi, 'criarBloqueio')
      .mockResolvedValue(baseBloq);

    renderPage();
    await screen.findByText(/nenhum bloqueio/i, {}, { timeout: 3000 });

    const select = document.querySelector<HTMLSelectElement>('select')!;
    fireEvent.change(select, { target: { value: 'pr-1' } });

    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    fireEvent.change(inputs[0], { target: { value: '2026-05-20T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-05-20T10:00' } });

    fireEvent.click(screen.getByRole('button', { name: /criar bloqueio/i }));

    await waitFor(() => {
      expect(criarMock).toHaveBeenCalled();
    });
    const payload = criarMock.mock.calls[0][0];
    expect(payload.profissionalId).toBe('pr-1');
    expect(payload.dataHoraInicio).toMatch(/^2026-05-20T/);
  });

  it('validação: fim <= início mostra erro', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([]);
    const criarMock = vi.spyOn(agendaApi, 'criarBloqueio');

    renderPage();
    await screen.findByText(/nenhum bloqueio/i, {}, { timeout: 3000 });

    const select = document.querySelector<HTMLSelectElement>('select')!;
    fireEvent.change(select, { target: { value: 'pr-1' } });

    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    fireEvent.change(inputs[0], { target: { value: '2026-05-20T10:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-05-20T09:00' } });

    fireEvent.click(screen.getByRole('button', { name: /criar bloqueio/i }));

    await screen.findByText(/fim deve ser depois/i);
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('remover com confirm=true chama API', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([baseBloq]);
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true);
    const removerMock = vi
      .spyOn(agendaApi, 'removerBloqueio')
      .mockResolvedValue();

    renderPage();
    await screen.findByText('Almoço', {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: /^remover$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(
      () => expect(removerMock).toHaveBeenCalled(),
      { timeout: 3000 },
    );
    expect(removerMock.mock.calls[0][0]).toBe('bq-1');
  });

  it('remover com confirm=false aborta', async () => {
    vi.spyOn(agendaApi, 'listarBloqueios').mockResolvedValue([baseBloq]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const removerMock = vi.spyOn(agendaApi, 'removerBloqueio');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /remover/i }));

    expect(removerMock).not.toHaveBeenCalled();
  });
});
