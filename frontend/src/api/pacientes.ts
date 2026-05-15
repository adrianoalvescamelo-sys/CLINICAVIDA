import { api } from './client';
import type {
  Paciente,
  PacienteFormData,
  PacienteListResponse,
} from '../types/paciente';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function listPacientes(params: {
  q?: string;
  pagina?: number;
  limite?: number;
}): Promise<PacienteListResponse> {
  const { data } = await api.get<Envelope<PacienteListResponse>>('/pacientes', {
    params,
  });
  return data.data;
}

export async function getPaciente(id: string): Promise<Paciente> {
  const { data } = await api.get<Envelope<Paciente>>(`/pacientes/${id}`);
  return data.data;
}

export async function createPaciente(payload: PacienteFormData) {
  const { data } = await api.post<Envelope<Paciente>>('/pacientes', payload);
  return data.data;
}

export async function updatePaciente(
  id: string,
  payload: PacienteFormData & { updatedAt: string },
) {
  const { data } = await api.patch<Envelope<Paciente>>(
    `/pacientes/${id}`,
    payload,
  );
  return data.data;
}
