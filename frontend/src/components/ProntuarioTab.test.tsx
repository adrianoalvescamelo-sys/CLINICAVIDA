import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProntuarioTab from './ProntuarioTab';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as prontuarioApi from '../api/prontuario';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok', refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}
function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProntuarioTab pacienteId="pac-1" />
    </QueryClientProvider>,
  );
}
const evo = {
  id: 'evo-1', prontuarioId: 'pr-1', agendamentoId: 'ag-1', autorUsuarioId: 'u1',
  autorEhMedico: true, queixaPrincipal: 'dor', subjetivo: 'S', objetivo: 'O',
  avaliacao: 'A', plano: 'P', versao: 1, replacesId: null, createdAt: '2026-05-23T12:00:00.000Z',
};

describe('ProntuarioTab — listagem', () => {
  beforeEach(() => { vi.restoreAllMocks(); setUser('MEDICO'); });

  it('empty state', async () => {
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({ prontuario: null, evolucoes: [] });
    renderTab();
    await screen.findByText(/nenhuma evolução/i);
  });

  it('renderiza evolução com SOAP e botão Nova evolução para médico', async () => {
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({
      prontuario: { id: 'pr-1', pacienteId: 'pac-1', createdAt: '', updatedAt: '' },
      evolucoes: [evo],
    });
    renderTab();
    await screen.findByText('S');
    expect(screen.getByText(/avaliação/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nova evolução/i })).toBeInTheDocument();
  });

  it('ADMIN não vê botão Nova evolução', async () => {
    setUser('ADMIN');
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({ prontuario: null, evolucoes: [] });
    renderTab();
    await screen.findByText(/nenhuma evolução/i);
    expect(screen.queryByRole('button', { name: /nova evolução/i })).not.toBeInTheDocument();
  });
});
