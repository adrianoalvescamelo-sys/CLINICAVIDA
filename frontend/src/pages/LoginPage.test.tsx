/**
 * LoginPage — auth flow crítico
 *
 * Cobre:
 *  - submit sucesso: chama login(), persiste session, navega para /
 *  - submit falha 401: exibe mensagem do API error
 *  - submit falha rede: exibe fallback "Falha ao entrar"
 *  - durante submit: botão disabled + texto "Entrando…"
 *  - validação HTML: required em email + senha
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { useAuthStore } from '../store/auth';
import * as authApi from '../api/auth';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

function setup() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, refreshToken: null, user: null });
    navigateMock.mockReset();
    vi.restoreAllMocks();
  });

  it('renderiza campos e botão', () => {
    setup();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('submit sucesso: persiste session + navega para /', async () => {
    const loginMock = vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'tok-access',
      refresh_token: 'tok-refresh',
      expires_in: '15m',
      usuario: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@clinicavida.local',
        nomeCompleto: 'Admin',
        perfil: 'ADMIN',
      },
    } as Awaited<ReturnType<typeof authApi.login>>);

    setup();

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'admin@clinicavida.local' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'Admin@2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/');
    });

    expect(loginMock).toHaveBeenCalledWith(
      'admin@clinicavida.local',
      'Admin@2026!',
    );
    const state = useAuthStore.getState();
    expect(state.token).toBe('tok-access');
    expect(state.refreshToken).toBe('tok-refresh');
    expect(state.user?.perfil).toBe('ADMIN');
  });

  it('submit falha 401: exibe mensagem do API error', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue({
      response: {
        data: { error: { message: 'Credenciais inválidas' } },
      },
    });

    setup();

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'wrong@x.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'badpw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Credenciais inválidas');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('submit falha sem response: fallback "Falha ao entrar"', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('network down'));

    setup();

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Falha ao entrar');
  });

  it('durante submit: botão disabled com texto "Entrando…"', async () => {
    let resolvePromise!: (v: Awaited<ReturnType<typeof authApi.login>>) => void;
    vi.spyOn(authApi, 'login').mockReturnValue(
      new Promise((r) => {
        resolvePromise = r;
      }),
    );

    setup();

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(
      screen.getByRole('button', { name: /entrando/i }),
    ).toBeDisabled();

    // resolve para limpar estado
    resolvePromise({
      access_token: 't',
      refresh_token: 'r',
      expires_in: '15m',
      usuario: {
        id: 'x',
        email: 'a@b.com',
        nomeCompleto: 'X',
        perfil: 'ADMIN',
      },
    } as Awaited<ReturnType<typeof authApi.login>>);
  });

  it('inputs têm required HTML5', () => {
    setup();
    expect(screen.getByLabelText(/e-mail/i)).toBeRequired();
    expect(screen.getByLabelText(/senha/i)).toBeRequired();
  });
});
