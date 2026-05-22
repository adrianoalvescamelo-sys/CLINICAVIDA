import { api } from './client';
import type { AuthUser } from '../store/auth';

interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: string;
    usuario: AuthUser;
  };
}

interface RefreshResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: string;
  };
}

export async function login(email: string, senha: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    senha,
  });
  return data.data;
}

export async function refreshTokens(refreshToken: string) {
  const { data } = await api.post<RefreshResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return data.data;
}

export async function logout(refreshToken?: string) {
  await api.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
}

export async function trocarSenha(payload: {
  senhaAtual: string;
  novaSenha: string;
}) {
  await api.post('/auth/trocar-senha', payload);
}
