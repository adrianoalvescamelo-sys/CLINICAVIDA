import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentosTab from './DocumentosTab';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as documentosApi from '../api/documentos';

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
      <DocumentosTab pacienteId="pac-1" />
    </QueryClientProvider>,
  );
}
const doc = {
  id: 'doc-1', tipo: 'RECEITA' as const, conteudo: {}, pacienteId: 'pac-1',
  autorUsuarioId: 'u1', autorEhMedico: true, agendamentoId: null,
  createdAt: '2026-05-23T12:00:00.000Z',
};

describe('DocumentosTab', () => {
  beforeEach(() => { vi.restoreAllMocks(); setUser('MEDICO'); });

  it('lista documentos e baixa PDF', async () => {
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([doc] as never);
    const baixar = vi.spyOn(documentosApi, 'baixarDocumentoPdf').mockResolvedValue();
    renderTab();
    await screen.findByText('Receita');
    fireEvent.click(screen.getByRole('button', { name: /baixar pdf/i }));
    await waitFor(() => expect(baixar).toHaveBeenCalledWith('doc-1', 'RECEITA', 'tok'));
  });

  it('médico vê botão Novo documento; empty state sem itens', async () => {
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([] as never);
    renderTab();
    await screen.findByText(/nenhum documento/i);
    expect(screen.getByRole('button', { name: /novo documento/i })).toBeInTheDocument();
  });

  it('ADMIN não vê botão Novo documento', async () => {
    setUser('ADMIN');
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([] as never);
    renderTab();
    await screen.findByText(/nenhum documento/i);
    expect(screen.queryByRole('button', { name: /novo documento/i })).not.toBeInTheDocument();
  });
});
