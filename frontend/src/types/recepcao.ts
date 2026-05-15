import type { AgendamentoListItem, AgendamentoStatus } from './agenda';
import type { ListaEsperaItem } from './lista-espera';
import type { MensagemWhatsapp } from './whatsapp';

export interface RecepcaoDashboard {
  agendaDoDia: AgendamentoListItem[];
  aguardando: AgendamentoListItem[];
  confirmacoesPendentes: AgendamentoListItem[];
  emAtendimento: AgendamentoListItem[];
  mensagensPendentes: MensagemWhatsapp[];
  listaEspera: ListaEsperaItem[];
  generatedAt: string;
}

export interface RecepcaoDashboardParams {
  data: string;
  profissionalId?: string;
  status?: AgendamentoStatus;
}
