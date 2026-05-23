import { api } from './client';
import type {
  ProntuarioResult,
  Evolucao,
  EvolucaoPayload,
  RetificarPayload,
} from '../types/prontuario';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function getProntuario(
  pacienteId: string,
): Promise<ProntuarioResult> {
  const { data } = await api.get<Envelope<ProntuarioResult>>(
    `/pacientes/${pacienteId}/prontuario`,
  );
  return data.data;
}

export async function getEvolucao(id: string): Promise<Evolucao> {
  const { data } = await api.get<Envelope<Evolucao>>(`/evolucoes/${id}`);
  return data.data;
}

export async function criarEvolucao(
  pacienteId: string,
  payload: EvolucaoPayload,
): Promise<Evolucao> {
  const { data } = await api.post<Envelope<Evolucao>>(
    `/pacientes/${pacienteId}/prontuario/evolucoes`,
    payload,
  );
  return data.data;
}

export async function retificarEvolucao(
  id: string,
  payload: RetificarPayload,
): Promise<Evolucao> {
  const { data } = await api.post<Envelope<Evolucao>>(
    `/evolucoes/${id}/retificar`,
    payload,
  );
  return data.data;
}
