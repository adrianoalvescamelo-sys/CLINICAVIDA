export type MensagemTipo =
  | 'CONFIRMACAO_24H'
  | 'LEMBRETE_2H'
  | 'CONFIRMACAO_TARDIA'
  | 'CANCELAMENTO'
  | 'REMARCACAO'
  | 'VAGA_LIBERADA'
  | 'CUSTOM';

export type MensagemStatus =
  | 'PENDENTE'
  | 'ENVIADA'
  | 'ENTREGUE'
  | 'RESPONDIDA'
  | 'FALHA'
  | 'CANCELADA';

export interface MensagemWhatsapp {
  id: string;
  pacienteId: string | null;
  agendamentoId: string | null;
  telefone: string;
  tipo: MensagemTipo;
  status: MensagemStatus;
  tentativas: number;
  proximoRetryEm: string | null;
  erro: string | null;
  enviadaEm: string | null;
  createdAt: string;
  paciente: { id: string; nomeCompleto: string } | null;
  agendamento: {
    id: string;
    dataHoraInicio: string;
    status: string;
  } | null;
}
