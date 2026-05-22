import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  nomeCompleto: string;
  perfil: 'ADMIN' | 'RECEPCAO' | 'MEDICO' | 'PROFISSIONAL_NAO_MEDICO';
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, refreshToken: string, user: AuthUser) => void;
  updateTokens: (token: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, refreshToken, user) =>
        set({ token, refreshToken, user }),
      updateTokens: (token, refreshToken) =>
        set({ token, refreshToken }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'clinicavida-auth' },
  ),
);
