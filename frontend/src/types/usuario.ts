export type Perfil = 'ADMIN' | 'RECEPCAO' | 'MEDICO' | 'PROFISSIONAL_NAO_MEDICO';

export interface Usuario {
  id: string;
  email: string;
  nomeCompleto: string;
  perfil: Perfil;
  ativo: boolean;
  tentativasLogin: number;
  bloqueadoAte: string | null;
  ultimoLoginEm: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsuarioCreateData {
  email: string;
  senha: string;
  nomeCompleto: string;
  perfil: Perfil;
}

export interface UsuarioUpdateData {
  nomeCompleto?: string;
  perfil?: Perfil;
  ativo?: boolean;
}

export interface ResetSenhaData {
  novaSenha: string;
}

export const PERFIS: { value: Perfil; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'RECEPCAO', label: 'Recepção' },
  { value: 'MEDICO', label: 'Médico' },
  { value: 'PROFISSIONAL_NAO_MEDICO', label: 'Profissional (não médico)' },
];
