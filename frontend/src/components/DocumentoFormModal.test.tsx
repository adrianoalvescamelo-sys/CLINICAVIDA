import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentoFormModal from './DocumentoFormModal';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as agendaApi from '../api/agenda';
import * as documentosApi from '../api/documentos';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok', refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}
function renderModal(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentoFormModal open pacienteId="pac-1" onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  );
}

describe('DocumentoFormModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUser('MEDICO');
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([] as never);
  });

  it('médico vê tipo RECEITA; não-médico não vê RECEITA/ATESTADO', () => {
    renderModal();
    const select = screen.getByLabelText(/tipo/i) as HTMLSelectElement;
    const valores = Array.from(select.options).map((o) => o.value);
    expect(valores).toContain('RECEITA');
    expect(valores).toContain('ATESTADO');

    setUser('PROFISSIONAL_NAO_MEDICO');
    renderModal();
    const selects = screen.getAllByLabelText(/tipo/i) as HTMLSelectElement[];
    const ultimos = Array.from(selects[selects.length - 1].options).map((o) => o.value);
    expect(ultimos).not.toContain('RECEITA');
    expect(ultimos).not.toContain('ATESTADO');
    expect(ultimos).toContain('ORIENTACOES');
  });

  it('ORIENTACOES envia conteudo {texto}', async () => {
    const criar = vi.spyOn(documentosApi, 'criarDocumento').mockResolvedValue({ id: 'doc-1' } as never);
    const onSaved = vi.fn();
    renderModal(onSaved);
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'ORIENTACOES' } });
    fireEvent.change(screen.getByLabelText(/texto/i), { target: { value: 'repouso 48h' } });
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      tipo: 'ORIENTACOES', conteudo: { texto: 'repouso 48h' },
    })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('ATESTADO envia diasAfastamento numérico', async () => {
    const criar = vi.spyOn(documentosApi, 'criarDocumento').mockResolvedValue({ id: 'd' } as never);
    renderModal();
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'ATESTADO' } });
    fireEvent.change(screen.getByLabelText(/dias de afastamento/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      tipo: 'ATESTADO', conteudo: expect.objectContaining({ diasAfastamento: 3 }),
    })));
  });
});
