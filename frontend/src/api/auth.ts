import { api } from './client';
import type { AuthUser } from '../store/auth';

interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    expires_in: string;
    usuario: AuthUser;
  };
}

export async function login(email: string, senha: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    senha,
  });
  return data.data;
}

export async function logout() {
  await api.post('/auth/logout');
}
