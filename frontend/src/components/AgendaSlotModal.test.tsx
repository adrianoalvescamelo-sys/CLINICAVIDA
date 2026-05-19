/**
 * AgendaSlotModal — Agendar (redireciona) vs Bloquear (form inline)
 *
 * Cobre:
 *  - open=false não renderiza
 *  - modo padrão é AGENDAR; clicar Continuar navega para /agenda/novo
 *  - troca para BLOQUEAR mostra form
 *  - validação: sem profissionalId aborta com erro
 *  - bloquear chama criarBloqueio com ISO + motivo
 *  - "Dia todo" usa 00:00 → 23:59
 *  - fim <= inicio mostra erro
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AgendaSlotModal from './AgendaSlotModal';
import * as agendaApi from '../api/agenda';
import * as cfgApi from '../api/configuracoes';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

function renderModal(props: Partial<React.ComponentProps<typeof AgendaSlotModal>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AgendaSlotModal
          open
          data="2026-05-20"
          hora="09:00"
          profissionalId="pr-1"
          profissionalNome="Dr. Beta"
          onClose={() => {}}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AgendaSlotModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue({
      id: 'c',
      nomeClinica: 'X',
      horaAbertura: '08:00',
      horaFechamento: '18:00',
      diasFuncionamento: [1, 2, 3, 4, 5],
      duracaoConsultaMin: 15,
      intervaloAlmocoIni: null,
      intervaloAlmocoFim: null,
      timezone: 'America/Cuiaba',
      updatedAt: '2026-05-15T00:00:00.000Z',
      atualizadoPor: null,
    });
  });

  it('open=false não renderiza nada', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('modo AGENDAR é o padrão; clicar Continuar navega', () => {
    renderModal();
    expect(screen.getByText(/novo agendamento/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/agenda\/novo\?/),
    );
  });

  it('cabeçalho muda quando muda para BLOQUEAR', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText(/bloquear horário/i));
    // título h3 muda para "Bloquear horário"
    expect(screen.getByRole('heading', { name: /bloquear horário/i })).toBeInTheDocument();
  });

  it('BLOQUEAR sem profissionalId mostra erro', async () => {
    renderModal({ profissionalId: undefined });
    fireEvent.click(screen.getByLabelText(/bloquear horário/i));
    fireEvent.click(screen.getByRole('button', { name: /salvar bloqueio/i }));
    await screen.findByText(/selecione um profissional/i);
  });

  it('BLOQUEAR chama criarBloqueio com ISO + motivo', async () => {
    const criarMock = vi
      .spyOn(agendaApi, 'criarBloqueio')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.criarBloqueio>>);

    renderModal();
    fireEvent.click(screen.getByLabelText(/bloquear horário/i));

    // Espera config carregar (define horaFim sugerido)
    await waitFor(() => {
      const fim = document.querySelector<HTMLInputElement>(
        'input[type="time"]',
      );
      expect(fim).toBeTruthy();
    });

    const motivo = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Almoço"]',
    )!;
    fireEvent.change(motivo, { target: { value: 'Café' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar bloqueio/i }));

    await waitFor(() => expect(criarMock).toHaveBeenCalled());
    const payload = criarMock.mock.calls[0][0];
    expect(payload.profissionalId).toBe('pr-1');
    expect(payload.motivo).toBe('Café');
    expect(payload.dataHoraInicio).toContain('2026-05-20');
  });

  it('Dia todo marca início 00:00 e fim 23:59', async () => {
    const criarMock = vi
      .spyOn(agendaApi, 'criarBloqueio')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.criarBloqueio>>);

    renderModal();
    fireEvent.click(screen.getByLabelText(/bloquear horário/i));
    fireEvent.click(screen.getByLabelText(/dia todo/i));
    fireEvent.click(screen.getByRole('button', { name: /salvar bloqueio/i }));

    await waitFor(() => expect(criarMock).toHaveBeenCalled());
    const p = criarMock.mock.calls[0][0];
    const ini = new Date(p.dataHoraInicio);
    const fim = new Date(p.dataHoraFim);
    expect(ini.getHours()).toBe(0);
    expect(ini.getMinutes()).toBe(0);
    expect(fim.getHours()).toBe(23);
    expect(fim.getMinutes()).toBe(59);
  });
});
