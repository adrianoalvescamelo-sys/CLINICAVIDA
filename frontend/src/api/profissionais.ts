import { api } from './client';
import type {
  Profissional,
  ProfissionalFormData,
  ProfissionalUpdateData,
} from '../types/profissional';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function listProfissionais(params: {
  ativos?: boolean;
} = {}): Promise<Profissional[]> {
  const { data } = await api.get<Envelope<Profissional[]>>('/profissionais', {
    params,
  });
  return data.data;
}

export async function getProfissional(id: string): Promise<Profissional> {
  const { data } = await api.get<Envelope<Profissional>>(
    `/profissionais/${id}`,
  );
  return data.data;
}

export async function createProfissional(payload: ProfissionalFormData) {
  const { data } = await api.post<Envelope<Profissional>>(
    '/profissionais',
    payload,
  );
  return data.data;
}

export async function updateProfissional(
  id: string,
  payload: ProfissionalUpdateData,
) {
  const { data } = await api.patch<Envelope<Profissional>>(
    `/profissionais/${id}`,
    payload,
  );
  return data.data;
}
