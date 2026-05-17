/**
 * PainelTVPage — display público de chamadas
 *
 * Cobre:
 *  - loading state
 *  - error state
 *  - hero exibe paciente chamado quando destaque presente
 *  - fila renderiza próximos
 *  - empty: "Aguardando chamada" sem destaque
 *  - empty: "Sem pacientes aguardando" sem proximos
 *  - links operacionais para /agenda e /recepcao
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PainelTVPage from './PainelTVPage';
import * as recepcaoApi from '../api/recepcao';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PainelTVPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const chamado = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pacienteId: 'p1',
  profissionalId: 'pr1',
  dataHoraInicio: '2026-05-17T14:00:00.000Z',
  dataHoraFim: '2026-05-17T14:30:00.000Z',
  tipo: 'CONSULTA' as const,
  status: 'EM_ATENDIMENTO' as const,
  origem: 'RECEPCAO' as const,
  encaixe: false,
  paciente: { id: 'p1', nomeCompleto: 'Joaquim Andrade Silva' },
  profissional: { id: 'pr1', nomeCompleto: 'Dr. Carlos', cor: '#0f766e' },
};

const proximo = {
  ...chamado,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'AGUARDANDO' as const,
  paciente: { id: 'p2', nomeCompleto: 'Maria Souza' },
};

describe('PainelTVPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loading state inicial', () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando painel/i)).toBeInTheDocument();
  });

  it('hero exibe nome completo do paciente chamado', async () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockResolvedValue({
      chamadoAgora: chamado,
      proximos: [proximo],
      generatedAt: '2026-05-17T14:00:00.000Z',
    } as Awaited<ReturnType<typeof recepcaoApi.obterPainelTV>>);

    renderPage();

    // CLAUDE.md: "Painel TV exibe nome completo" — sem truncamento
    // Nome aparece em hero + queueCard "Em atendimento" — findAllBy
    const matches = await screen.findAllByText(
      'Joaquim Andrade Silva',
      {},
      { timeout: 3000 },
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/dirija-se ao consultório/i)).toBeInTheDocument();
  });

  it('hero "Aguardando chamada" quando destaque null', async () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockResolvedValue({
      chamadoAgora: null,
      proximos: [],
      generatedAt: '2026-05-17T14:00:00.000Z',
    } as Awaited<ReturnType<typeof recepcaoApi.obterPainelTV>>);

    renderPage();

    await screen.findByText(/aguardando chamada/i, {}, { timeout: 3000 });
    expect(
      screen.getByText(/sem paciente em atendimento/i),
    ).toBeInTheDocument();
  });

  it('fila renderiza próximos pacientes', async () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockResolvedValue({
      chamadoAgora: chamado,
      proximos: [proximo],
      generatedAt: '2026-05-17T14:00:00.000Z',
    } as Awaited<ReturnType<typeof recepcaoApi.obterPainelTV>>);

    renderPage();

    await screen.findByText('Maria Souza', {}, { timeout: 3000 });
  });

  it('"Sem pacientes aguardando" quando fila vazia', async () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockResolvedValue({
      chamadoAgora: chamado,
      proximos: [],
      generatedAt: '2026-05-17T14:00:00.000Z',
    } as Awaited<ReturnType<typeof recepcaoApi.obterPainelTV>>);

    renderPage();

    await screen.findByText(/sem pacientes aguardando/i, {}, { timeout: 3000 });
  });

  it('links operacionais para /agenda e /recepcao', async () => {
    vi.spyOn(recepcaoApi, 'obterPainelTV').mockResolvedValue({
      chamadoAgora: null,
      proximos: [],
      generatedAt: '2026-05-17T14:00:00.000Z',
    } as Awaited<ReturnType<typeof recepcaoApi.obterPainelTV>>);

    renderPage();

    const agenda = await screen.findByRole('link', { name: /agenda do dia/i });
    expect(agenda).toHaveAttribute('href', '/agenda');

    const recepcao = screen.getByRole('link', { name: /ver recepção/i });
    expect(recepcao).toHaveAttribute('href', '/recepcao');
  });
});
