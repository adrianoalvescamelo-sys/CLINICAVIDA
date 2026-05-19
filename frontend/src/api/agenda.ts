import { api } from './client';
import type {
  AgendamentoListItem,
  AgendamentoStatus,
  NovoAgendamento,
  Profissional,
} from '../types/agenda';

interface Env<T> {
  success: boolean;
  data: T;
}

export async function listProfissionais(ativos = true): Promise<Profissional[]> {
  const { data } = await api.get<Env<Profissional[]>>('/profissionais', {
    params: { ativos },
  });
  return data.data;
}

export async function listAgendamentos(params: {
  inicio?: string;
  fim?: string;
  profissionalId?: string;
  status?: AgendamentoStatus;
}): Promise<AgendamentoListItem[]> {
  const { data } = await api.get<Env<AgendamentoListItem[]>>('/agendamentos', {
    params,
  });
  return data.data;
}

export async function criarAgendamento(payload: NovoAgendamento) {
  const { data } = await api.post<Env<AgendamentoListItem>>(
    '/agendamentos',
    payload,
  );
  return data.data;
}

export async function alterarStatus(
  id: string,
  status: AgendamentoStatus,
  motivoCancelamento?: string,
) {
  const { data } = await api.patch<Env<AgendamentoListItem>>(
    `/agendamentos/${id}`,
    { status, motivoCancelamento },
  );
  return data.data;
}

export interface AgendamentoUpdatePayload {
  dataHoraInicio?: string;
  dataHoraFim?: string;
  profissionalId?: string;
  observacoes?: string;
}

export async function atualizarAgendamento(
  id: string,
  payload: AgendamentoUpdatePayload,
) {
  const { data } = await api.patch<Env<AgendamentoListItem>>(
    `/agendamentos/${id}`,
    payload,
  );
  return data.data;
}

export async function chamarAgendamento(id: string) {
  const { data } = await api.post<Env<AgendamentoListItem>>(
    `/agendamentos/${id}/chamar`,
  );
  return data.data;
}

export async function marcarAgendamentoAtendido(id: string) {
  const { data } = await api.post<Env<AgendamentoListItem>>(
    `/agendamentos/${id}/atendido`,
  );
  return data.data;
}

export interface Bloqueio {
  id: string;
  profissionalId: string;
  dataHoraInicio: string;
  dataHoraFim: string;
  motivo: string | null;
  createdAt: string;
  profissional?: {
    id: string;
    nomeCompleto: string;
    especialidade: string | null;
  };
}

export interface NovoBloqueio {
  profissionalId: string;
  dataHoraInicio: string;
  dataHoraFim: string;
  motivo?: string;
}

export async function listarBloqueios(
  profissionalId?: string,
): Promise<Bloqueio[]> {
  const { data } = await api.get<Env<Bloqueio[]>>('/agendamentos/bloqueios', {
    params: profissionalId ? { profissionalId } : {},
  });
  return data.data;
}

export async function criarBloqueio(payload: NovoBloqueio): Promise<Bloqueio> {
  const { data } = await api.post<Env<Bloqueio>>(
    '/agendamentos/bloqueios',
    payload,
  );
  return data.data;
}

export async function removerBloqueio(id: string): Promise<void> {
  await api.delete(`/agendamentos/bloqueios/${id}`);
}
