export interface Profissional {
  id: string;
  nomeCompleto: string;
  especialidade: string | null;
  registroConselho: string | null;
  ehMedico: boolean;
  ativo: boolean;
  usuarioId: string | null;
  cor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfissionalFormData {
  nomeCompleto: string;
  especialidade?: string;
  registroConselho?: string;
  ehMedico?: boolean;
  usuarioId?: string;
  cor?: string;
}

export interface ProfissionalUpdateData extends ProfissionalFormData {
  ativo?: boolean;
}
