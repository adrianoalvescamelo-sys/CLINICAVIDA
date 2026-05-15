import { api } from './client';
import type { MensagemWhatsapp } from '../types/whatsapp';

interface Env<T> {
  success: boolean;
  data: T;
}

export async function listPendentes(): Promise<MensagemWhatsapp[]> {
  const { data } = await api.get<Env<MensagemWhatsapp[]>>(
    '/whatsapp/pendentes',
  );
  return data.data;
}

export async function reenviar(id: string): Promise<MensagemWhatsapp> {
  const { data } = await api.post<Env<MensagemWhatsapp>>(
    `/whatsapp/${id}/reenviar`,
  );
  return data.data;
}
