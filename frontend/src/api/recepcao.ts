import { api } from './client';
import type {
  PainelTVData,
  RecepcaoDashboard,
  RecepcaoDashboardParams,
} from '../types/recepcao';

interface Env<T> {
  success: boolean;
  data: T;
}

export async function obterDashboardRecepcao(
  params: RecepcaoDashboardParams,
): Promise<RecepcaoDashboard> {
  const { data } = await api.get<Env<RecepcaoDashboard>>(
    '/recepcao/dashboard',
    { params },
  );
  return data.data;
}

export async function obterPainelTV(dataAlvo: string): Promise<PainelTVData> {
  const { data } = await api.get<Env<PainelTVData>>('/recepcao/painel-tv', {
    params: { data: dataAlvo },
  });
  return data.data;
}

