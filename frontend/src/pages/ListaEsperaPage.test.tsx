/**
 * ListaEsperaPage — dedicada (não confundir com card no RecepcaoPage)
 *
 * Cobre:
 *  - loading + empty
 *  - render tabela com paciente, WhatsApp formatado, prioridade, status
 *  - filtro status passa para API
 *  - ATIVO mostra "Ofertar", "Cancelar"
 *  - CONTATADO mostra "Agendou", "Recusou", "Cancelar"
 *  - ofertar mutation chama API
 *  - recusar usa window.prompt + passa motivo
 *  - cancelar usa window.confirm
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ListaEsperaPage from './ListaEsperaPage';
import * as listaEsperaApi from '../api/lista-espera';
import * as profissionaisApi from '../api/profissionais';
import { useAuthStore } from '../store/auth';
import type { ListaEsperaItem } from '../types/lista-espera';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ListaEsperaPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseAtivo: ListaEsperaItem = {
  id: 'le-1',
  pacienteId: 'p1',
  profissionalId: null,
  especialidade: 'Cardiologia',
  prioridade: 50,
  melhoresHorarios: null,
  observacoes: null,
  status: 'ATIVO',
  ultimaOfertaEm: null,
  ultimaRespostaEm: null,
  motivoRecusa: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  paciente: {
    id: 'p1',
    nomeCompleto: 'Paciente Alpha',
    telefoneWhatsapp: '65999991111',
  },
  profissional: null,
};

const baseContatado: ListaEsperaItem = {
  ...baseAtivo,
  id: 'le-2',
  status: 'CONTATADO',
};

describe('ListaEsperaPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: { id: 'r', email: 'r@x', nomeCompleto: 'Recep', perfil: 'RECEPCAO' },
    });
    vi.spyOn(profissionaisApi, 'listProfissionais').mockResolvedValue([]);
  });

  it('exibe loading', () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('empty state quando sem itens', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText(/nenhum paciente na lista de espera/i, {}, { timeout: 3000 });
  });

  it('render tabela com paciente + telefone formatado + prioridade', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseAtivo],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(screen.getByText('(65) 99999-1111')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    // "Ativo" aparece no <option> do filtro também — basta haver pelo menos um
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
  });

  it('ATIVO mostra botões Ofertar e Cancelar', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseAtivo],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /ofertar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agendou/i })).toBeNull();
  });

  it('CONTATADO mostra Agendou, Recusou e Cancelar', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseContatado],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /agendou/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recusou/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('ofertar chama API ofertarVaga(id)', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseAtivo],
      nextCursor: null,
    });
    const ofertarMock = vi
      .spyOn(listaEsperaApi, 'ofertarVaga')
      .mockResolvedValue(baseAtivo);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /ofertar/i }));
    await waitFor(() => expect(ofertarMock).toHaveBeenCalledWith(baseAtivo.id));
  });

  it('recusar usa prompt + passa motivo', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseContatado],
      nextCursor: null,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Sem interesse');
    const recusarMock = vi
      .spyOn(listaEsperaApi, 'registrarRecusa')
      .mockResolvedValue(baseContatado);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /recusou/i }));

    await waitFor(() => {
      expect(recusarMock).toHaveBeenCalledWith(baseContatado.id, {
        motivoRecusa: 'Sem interesse',
      });
    });
  });

  it('cancelar usa confirm; aborta quando false', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseAtivo],
      nextCursor: null,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const atualizarMock = vi.spyOn(listaEsperaApi, 'atualizarListaEspera');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(atualizarMock).not.toHaveBeenCalled();
  });

  it('cancelar com confirm=true chama atualizarListaEspera com CANCELADO', async () => {
    vi.spyOn(listaEsperaApi, 'listarListaEspera').mockResolvedValue({
      items: [baseAtivo],
      nextCursor: null,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const atualizarMock = vi
      .spyOn(listaEsperaApi, 'atualizarListaEspera')
      .mockResolvedValue(baseAtivo);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }));

    await waitFor(() => {
      expect(atualizarMock).toHaveBeenCalledWith(baseAtivo.id, {
        status: 'CANCELADO',
      });
    });
  });

  it('mudar filtro status passa para API', async () => {
    const apiMock = vi
      .spyOn(listaEsperaApi, 'listarListaEspera')
      .mockResolvedValue({ items: [], nextCursor: null });

    renderPage();
    await screen.findByText(/nenhum paciente/i, {}, { timeout: 3000 });
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ATIVO' }),
    );

    // labels não tem htmlFor — pega <select> pela ordem (primeiro = Status)
    const selects = document.querySelectorAll<HTMLSelectElement>('select');
    fireEvent.change(selects[0], { target: { value: 'CONTATADO' } });

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONTATADO' }),
      );
    });
  });
});
