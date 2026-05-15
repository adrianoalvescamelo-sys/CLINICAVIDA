import { api } from './client';
import type {
  AtualizarListaEsperaPayload,
  CriarListaEsperaPayload,
  ListaEsperaItem,
  ListaEsperaStatus,
} from '../types/lista-espera';

interface Env<T> {
  success: boolean;
  data: T;
}

export async function listarListaEspera(params?: {
  status?: ListaEsperaStatus;
  profissionalId?: string;
  pacienteId?: string;
  especialidade?: string;
}): Promise<ListaEsperaItem[]> {
  const { data } = await api.get<Env<ListaEsperaItem[]>>('/lista-espera', {
    params,
  });
  return data.data;
}

export async function criarListaEspera(
  payload: CriarListaEsperaPayload,
): Promise<ListaEsperaItem> {
  const { data } = await api.post<Env<ListaEsperaItem>>(
    '/lista-espera',
    payload,
  );
  return data.data;
}

export async function atualizarListaEspera(
  id: string,
  payload: AtualizarListaEsperaPayload,
): Promise<ListaEsperaItem> {
  const { data } = await api.patch<Env<ListaEsperaItem>>(
    `/lista-espera/${id}`,
    payload,
  );
  return data.data;
}

export async function ofertarVaga(id: string): Promise<ListaEsperaItem> {
  const { data } = await api.post<Env<ListaEsperaItem>>(
    `/lista-espera/${id}/ofertar-vaga`,
  );
  return data.data;
}

export async function registrarRecusa(
  id: string,
  payload: { motivoRecusa?: string } = {},
): Promise<ListaEsperaItem> {
  const { data } = await api.post<Env<ListaEsperaItem>>(
    `/lista-espera/${id}/registrar-recusa`,
    payload,
  );
  return data.data;
}

export async function marcarAgendado(id: string): Promise<ListaEsperaItem> {
  const { data } = await api.post<Env<ListaEsperaItem>>(
    `/lista-espera/${id}/marcar-agendado`,
  );
  return data.data;
}
