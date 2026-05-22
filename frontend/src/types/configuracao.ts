export interface ConfiguracaoClinica {
  id: string;
  nomeClinica: string;
  horaAbertura: string; // HH:mm
  horaFechamento: string; // HH:mm
  diasFuncionamento: number[]; // 0=Domingo..6=Sábado
  duracaoConsultaMin: number;
  intervaloAlmocoIni: string | null;
  intervaloAlmocoFim: string | null;
  timezone: string;
  updatedAt: string;
  atualizadoPor: string | null;
}

export interface ConfiguracaoUpdate {
  nomeClinica?: string;
  horaAbertura?: string;
  horaFechamento?: string;
  diasFuncionamento?: number[];
  duracaoConsultaMin?: number;
  intervaloAlmocoIni?: string | null;
  intervaloAlmocoFim?: string | null;
  timezone?: string;
}

export const DIAS_SEMANA = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];
