/**
 * MinhaContaPage — troca de senha do próprio usuário
 *
 * Cobre:
 *  - mostra dados do user logado
 *  - validação client: senha e confirmação não conferem
 *  - validação client: nova senha igual à atual
 *  - sucesso: limpa sessão + navega /login
 *  - erro API: mostra mensagem
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MinhaContaPage from './MinhaContaPage';
import * as authApi from '../api/auth';
import { useAuthStore } from '../store/auth';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MinhaContaPage />
    </MemoryRouter>,
  );
}

function fill(senhaAtual: string, novaSenha: string, conf: string) {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="password"]',
  );
  fireEvent.change(inputs[0], { target: { value: senhaAtual } });
  fireEvent.change(inputs[1], { target: { value: novaSenha } });
  fireEvent.change(inputs[2], { target: { value: conf } });
}

describe('MinhaContaPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    useAuthStore.setState({
      token: 't',
      refreshToken: 'r',
      user: {
        id: 'u1',
        email: 'me@clinica.com',
        nomeCompleto: 'Eu Mesmo',
        perfil: 'MEDICO',
      },
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('mostra dados do user logado', () => {
    renderPage();
    expect(screen.getAllByText(/eu mesmo/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/me@clinica\.com/)).toBeInTheDocument();
    expect(screen.getAllByText(/MEDICO/).length).toBeGreaterThan(0);
  });

  it('erro quando confirmação difere', async () => {
    renderPage();
    fill('Velha@123', 'NovaSenha@1', 'Outra@2');
    fireEvent.click(screen.getByRole('button', { name: /trocar senha/i }));
    await screen.findByText(/não conferem/i);
  });

  it('erro quando nova senha igual atual', async () => {
    renderPage();
    fill('Mesma@123', 'Mesma@123', 'Mesma@123');
    fireEvent.click(screen.getByRole('button', { name: /trocar senha/i }));
    await screen.findByText(/igual à atual/i);
  });

  it('sucesso: chama trocarSenha + limpa sessão + redireciona /login', async () => {
    const spy = vi.spyOn(authApi, 'trocarSenha').mockResolvedValue();
    renderPage();
    fill('Velha@123', 'NovaSenha@1', 'NovaSenha@1');
    fireEvent.click(screen.getByRole('button', { name: /trocar senha/i }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        senhaAtual: 'Velha@123',
        novaSenha: 'NovaSenha@1',
      });
    });
    expect(useAuthStore.getState().user).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('erro API: mostra mensagem retornada', async () => {
    vi.spyOn(authApi, 'trocarSenha').mockRejectedValue({
      response: { data: { error: { message: 'Senha atual inválida' } } },
    });
    renderPage();
    fill('Errada@123', 'NovaSenha@1', 'NovaSenha@1');
    fireEvent.click(screen.getByRole('button', { name: /trocar senha/i }));
    await screen.findByText('Senha atual inválida');
  });
});
