export type Sexo = 'MASCULINO' | 'FEMININO' | 'OUTRO' | 'NAO_INFORMADO';

export interface Paciente {
  id: string;
  cpf: string;
  nomeCompleto: string;
  dataNascimento: string;
  sexo: Sexo;
  telefoneWhatsapp: string;
  telefoneSecundario: string | null;
  email: string | null;
  responsavelNome: string | null;
  responsavelCpf: string | null;
  endereco: Record<string, unknown> | null;
  observacoes: string | null;
  criadoPor: string | null;
  atualizadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PacienteListItem {
  id: string;
  nomeCompleto: string;
  cpf: string;
  dataNascimento: string;
  telefoneWhatsapp: string;
  updatedAt: string;
}

export interface PacienteListResponse {
  total: number;
  pagina: number;
  limite: number;
  itens: PacienteListItem[];
}

export interface PacienteFormData {
  nomeCompleto: string;
  cpf: string;
  dataNascimento: string;
  sexo?: Sexo;
  telefoneWhatsapp: string;
  telefoneSecundario?: string;
  email?: string;
  responsavelNome?: string;
  responsavelCpf?: string;
  observacoes?: string;
}
