export interface Evolucao {
  id: string;
  prontuarioId: string;
  agendamentoId: string;
  autorUsuarioId: string;
  autorEhMedico: boolean;
  queixaPrincipal: string | null;
  subjetivo: string;
  objetivo: string;
  avaliacao: string;
  plano: string;
  versao: number;
  replacesId: string | null;
  createdAt: string;
}

export interface Prontuario {
  id: string;
  pacienteId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProntuarioResult {
  prontuario: Prontuario | null;
  evolucoes: Evolucao[];
}

export interface EvolucaoPayload {
  agendamentoId: string;
  queixaPrincipal?: string;
  subjetivo: string;
  objetivo: string;
  avaliacao: string;
  plano: string;
}

export type RetificarPayload = Omit<EvolucaoPayload, 'agendamentoId'>;
