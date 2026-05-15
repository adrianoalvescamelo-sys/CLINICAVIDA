export type AgendamentoStatus =
  | 'SOLICITADO'
  | 'PRE_AGENDAMENTO'
  | 'CONFIRMADO'
  | 'CONFIRMACAO_TARDIA'
  | 'AGUARDANDO'
  | 'EM_ATENDIMENTO'
  | 'ATENDIDO'
  | 'FALTOU'
  | 'CANCELADO';

export type AgendamentoOrigem =
  | 'RECEPCAO'
  | 'ADMIN'
  | 'BOT_WHATSAPP'
  | 'PACIENTE_WHATSAPP';

export type TipoAtendimento =
  | 'CONSULTA'
  | 'RETORNO'
  | 'EXAME'
  | 'PROCEDIMENTO'
  | 'OUTRO';

export interface Profissional {
  id: string;
  nomeCompleto: string;
  especialidade: string | null;
  ehMedico: boolean;
  ativo: boolean;
  cor: string | null;
}

export interface AgendamentoListItem {
  id: string;
  pacienteId: string;
  profissionalId: string;
  dataHoraInicio: string;
  dataHoraFim: string;
  tipo: TipoAtendimento;
  status: AgendamentoStatus;
  origem: AgendamentoOrigem;
  encaixe: boolean;
  paciente: { id: string; nomeCompleto: string; telefoneWhatsapp: string };
  profissional: { id: string; nomeCompleto: string; cor: string | null };
}

export interface NovoAgendamento {
  pacienteId: string;
  profissionalId: string;
  dataHoraInicio: string;
  dataHoraFim: string;
  tipo?: TipoAtendimento;
  encaixe?: boolean;
  observacoes?: string;
}
