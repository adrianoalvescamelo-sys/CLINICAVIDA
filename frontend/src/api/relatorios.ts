import { api } from './client';

interface Env<T> {
  success: boolean;
  data: T;
}

export interface AgendaItem {
  id: string;
  dataHoraInicio: string;
  dataHoraFim: string;
  tipo: string;
  status: string;
  origem: string;
  encaixe: boolean;
  paciente: { id: string; nomeCompleto: string };
  profissional: { id: string; nomeCompleto: string; especialidade: string | null };
}

export interface AgendaDiaResult {
  data: string;
  profissionalId: string | null;
  total: number;
  agendamentos: AgendaItem[];
  generatedAt: string;
}

export interface PorStatusEntry {
  count: number;
  agendamentos: AgendaItem[];
}

export interface AgendamentosStatusResult {
  periodo: { inicio: string; fim: string };
  profissionalId: string | null;
  total: number;
  porStatus: Record<string, PorStatusEntry>;
  generatedAt: string;
}

export interface PacienteItem {
  id: string;
  nomeCompleto: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  telefoneWhatsapp: string;
  createdAt: string;
}

export interface PacientesPeriodoResult {
  periodo: { inicio: string; fim: string };
  total: number;
  pacientes: PacienteItem[];
  generatedAt: string;
}

export interface OrigemEntry {
  origem: string;
  count: number;
  percentual: number;
}

export interface OrigemResult {
  periodo: { inicio: string; fim: string };
  profissionalId: string | null;
  total: number;
  distribuicao: OrigemEntry[];
  generatedAt: string;
}

export interface RelatorioFiltros {
  inicio?: string;
  fim?: string;
  profissionalId?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Relatórios JSON
// ---------------------------------------------------------------------------

export async function getAgendaDia(params: {
  data?: string;
  profissionalId?: string;
}): Promise<AgendaDiaResult> {
  const { data } = await api.get<Env<AgendaDiaResult>>('/relatorios/agenda-dia', { params });
  return data.data;
}

export async function getAgendamentosStatus(
  params: RelatorioFiltros,
): Promise<AgendamentosStatusResult> {
  const { data } = await api.get<Env<AgendamentosStatusResult>>(
    '/relatorios/agendamentos-status',
    { params },
  );
  return data.data;
}

export async function getPacientesPeriodo(
  params: RelatorioFiltros,
): Promise<PacientesPeriodoResult> {
  const { data } = await api.get<Env<PacientesPeriodoResult>>(
    '/relatorios/pacientes-periodo',
    { params },
  );
  return data.data;
}

export async function getOrigemAgendamentos(
  params: RelatorioFiltros,
): Promise<OrigemResult> {
  const { data } = await api.get<Env<OrigemResult>>('/relatorios/origem', { params });
  return data.data;
}

// ---------------------------------------------------------------------------
// Exports (admin only) — dispara download via window.open
// ---------------------------------------------------------------------------

function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const base = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3000/api';
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function exportXlsx(
  tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
  params: Record<string, string | undefined>,
  token: string,
): void {
  // Usa fetch para incluir o header Authorization e acionar download
  const url = buildUrl(`/relatorios/export/${tipo}/xlsx`, params);
  fetchAndDownload(url, token, `relatorio-${tipo}.xlsx`);
}

export function exportPdf(
  tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
  params: Record<string, string | undefined>,
  token: string,
): void {
  const url = buildUrl(`/relatorios/export/${tipo}/pdf`, params);
  fetchAndDownload(url, token, `relatorio-${tipo}.pdf`);
}

function fetchAndDownload(url: string, token: string, filename: string): void {
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Export falhou: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    })
    .catch((err) => {
      console.error('Falha no download:', err);
      window.alert('Falha ao gerar arquivo. Verifique suas permissoes.');
    });
}
