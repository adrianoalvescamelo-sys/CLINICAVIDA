import { api } from './client';
import type {
  Usuario,
  UsuarioCreateData,
  UsuarioUpdateData,
  ResetSenhaData,
} from '../types/usuario';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function listUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get<Envelope<Usuario[]>>('/usuarios');
  return data.data;
}

export async function getUsuario(id: string): Promise<Usuario> {
  const { data } = await api.get<Envelope<Usuario>>(`/usuarios/${id}`);
  return data.data;
}

export async function createUsuario(payload: UsuarioCreateData) {
  const { data } = await api.post<Envelope<Usuario>>('/usuarios', payload);
  return data.data;
}

export async function updateUsuario(id: string, payload: UsuarioUpdateData) {
  const { data } = await api.patch<Envelope<Usuario>>(
    `/usuarios/${id}`,
    payload,
  );
  return data.data;
}

export async function resetSenhaUsuario(id: string, payload: ResetSenhaData) {
  const { data } = await api.patch<Envelope<{ id: string }>>(
    `/usuarios/${id}/senha`,
    payload,
  );
  return data.data;
}
