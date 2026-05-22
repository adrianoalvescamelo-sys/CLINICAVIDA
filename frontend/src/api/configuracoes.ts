import { api } from './client';
import type {
  ConfiguracaoClinica,
  ConfiguracaoUpdate,
} from '../types/configuracao';

interface Env<T> {
  success: boolean;
  data: T;
}

export async function getConfiguracao(): Promise<ConfiguracaoClinica> {
  const { data } = await api.get<Env<ConfiguracaoClinica>>('/configuracoes');
  return data.data;
}

export async function updateConfiguracao(
  payload: ConfiguracaoUpdate,
): Promise<ConfiguracaoClinica> {
  const { data } = await api.put<Env<ConfiguracaoClinica>>(
    '/configuracoes',
    payload,
  );
  return data.data;
}
