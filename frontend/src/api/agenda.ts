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
