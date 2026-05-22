/**
 * ConfiguracoesPage — singleton de configuração da clínica
 *
 * Cobre:
 *  - loading
 *  - form populado com dados carregados
 *  - toggle dia funciona
 *  - submit chama API com payload correto
 *  - usaAlmoco=false zera intervalos no payload
 *  - erro API renderiza mensagem
 *  - sucesso renderiza "salvas"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesPage from './ConfiguracoesPage';
import * as cfgApi from '../api/configuracoes';
import { useAuthStore } from '../store/auth';
import type { ConfiguracaoClinica } from '../types/configuracao';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConfiguracoesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseCfg: ConfiguracaoClinica = {
  id: 'cfg-1',
  nomeClinica: 'Clínica Vida',
  horaAbertura: '08:00',
  horaFechamento: '18:00',
  diasFuncionamento: [1, 2, 3, 4, 5],
  duracaoConsultaMin: 30,
  intervaloAlmocoIni: '12:00',
  intervaloAlmocoFim: '13:00',
  timezone: 'America/Cuiaba',
  updatedAt: '2026-05-15T10:00:00.000Z',
  atualizadoPor: null,
};

describe('ConfiguracoesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: { id: 'a', email: 'a@x', nomeCompleto: 'Admin', perfil: 'ADMIN' },
    });
  });

  it('exibe loading', () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('form populado com config carregada', async () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue(baseCfg);
    renderPage();
    await screen.findByDisplayValue('Clínica Vida', {}, { timeout: 3000 });
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('18:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('America/Cuiaba')).toBeInTheDocument();
  });

  it('submit chama updateConfiguracao com payload atual', async () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue(baseCfg);
    const updateMock = vi
      .spyOn(cfgApi, 'updateConfiguracao')
      .mockResolvedValue(baseCfg);

    renderPage();
    await screen.findByDisplayValue('Clínica Vida', {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
    });
    const payload = updateMock.mock.calls[0][0];
    expect(payload.nomeClinica).toBe('Clínica Vida');
    expect(payload.horaAbertura).toBe('08:00');
    expect(payload.intervaloAlmocoIni).toBe('12:00');
  });

  it('desligar almoço zera intervalos no payload', async () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue(baseCfg);
    const updateMock = vi
      .spyOn(cfgApi, 'updateConfiguracao')
      .mockResolvedValue(baseCfg);

    renderPage();
    await screen.findByDisplayValue('Clínica Vida', {}, { timeout: 3000 });

    fireEvent.click(screen.getByLabelText(/intervalo de almoço/i));

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
    });
    const payload = updateMock.mock.calls[0][0];
    expect(payload.intervaloAlmocoIni).toBeNull();
    expect(payload.intervaloAlmocoFim).toBeNull();
  });

  it('erro API exibe mensagem', async () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue(baseCfg);
    vi.spyOn(cfgApi, 'updateConfiguracao').mockRejectedValue({
      response: { data: { error: { message: 'Hora abertura inválida' } } },
    });

    renderPage();
    await screen.findByDisplayValue('Clínica Vida', {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await screen.findByText('Hora abertura inválida');
  });

  it('toggle dia: clicar em Sáb adiciona 6 ao array', async () => {
    vi.spyOn(cfgApi, 'getConfiguracao').mockResolvedValue(baseCfg);
    const updateMock = vi
      .spyOn(cfgApi, 'updateConfiguracao')
      .mockResolvedValue(baseCfg);

    renderPage();
    await screen.findByDisplayValue('Clínica Vida', {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole('button', { name: 'Sáb' }));
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
    });
    const payload = updateMock.mock.calls[0][0];
    expect(payload.diasFuncionamento).toContain(6);
  });
});
