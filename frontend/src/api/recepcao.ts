import { api } from './client';
import type {
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
