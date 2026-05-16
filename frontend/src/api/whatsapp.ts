import { api } from './client';
import type { MensagemWhatsapp } from '../types/whatsapp';

interface Env<T> {
  success: boolean;
  data: T;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export async function listPendentes(params?: {
  cursor?: string;
  limit?: number;
}): Promise<CursorPage<MensagemWhatsapp>> {
  const { data } = await api.get<Env<CursorPage<MensagemWhatsapp>>>(
    '/whatsapp/pendentes',
    { params },
  );
  return data.data;
}

export async function reenviar(id: string): Promise<MensagemWhatsapp> {
  const { data } = await api.post<Env<MensagemWhatsapp>>(
    `/whatsapp/${id}/reenviar`,
  );
  return data.data;
}
