export type ListaEsperaStatus =
  | 'ATIVO'
  | 'CONTATADO'
  | 'RECUSADO'
  | 'AGENDADO'
  | 'CANCELADO';

export interface ListaEsperaItem {
  id: string;
  pacienteId: string;
  profissionalId: string | null;
  especialidade: string | null;
  prioridade: number;
  melhoresHorarios: Record<string, unknown> | null;
  observacoes: string | null;
  status: ListaEsperaStatus;
  ultimaOfertaEm: string | null;
  ultimaRespostaEm: string | null;
  motivoRecusa: string | null;
  createdAt: string;
  updatedAt: string;
  paciente: { id: string; nomeCompleto: string; telefoneWhatsapp: string };
  profissional: {
    id: string;
    nomeCompleto: string;
    especialidade: string | null;
  } | null;
}

export interface CriarListaEsperaPayload {
  pacienteId: string;
  profissionalId?: string;
  especialidade?: string;
  prioridade: number;
  melhoresHorarios?: Record<string, unknown>;
  observacoes?: string;
}

export interface AtualizarListaEsperaPayload {
  profissionalId?: string | null;
  especialidade?: string;
  prioridade?: number;
  melhoresHorarios?: Record<string, unknown>;
  observacoes?: string;
  status?: ListaEsperaStatus;
}
