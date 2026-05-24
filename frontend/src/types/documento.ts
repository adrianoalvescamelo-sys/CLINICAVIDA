export type TipoDocumento =
  | 'RECEITA'
  | 'ATESTADO'
  | 'PEDIDO_EXAME'
  | 'ORIENTACOES';

export interface Medicamento {
  nome: string;
  posologia: string;
}

export type ConteudoDocumento =
  | { medicamentos: Medicamento[] }
  | { diasAfastamento: number; cid?: string; motivo?: string }
  | { exames: string[] }
  | { texto: string };

export interface DocumentoMedico {
  id: string;
  tipo: TipoDocumento;
  conteudo: Record<string, unknown>;
  pacienteId: string;
  autorUsuarioId: string;
  autorEhMedico: boolean;
  agendamentoId: string | null;
  createdAt: string;
}

export interface DocumentoPayload {
  tipo: TipoDocumento;
  conteudo: Record<string, unknown>;
  agendamentoId?: string;
}

export const LABEL_TIPO: Record<TipoDocumento, string> = {
  RECEITA: 'Receita',
  ATESTADO: 'Atestado',
  PEDIDO_EXAME: 'Pedido de exame',
  ORIENTACOES: 'Orientações',
};
