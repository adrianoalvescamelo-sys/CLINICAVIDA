import { api } from './client';
import { apiUrl, downloadAutenticado } from './download';
import type {
  DocumentoMedico,
  DocumentoPayload,
  TipoDocumento,
} from '../types/documento';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function listarDocumentos(
  pacienteId: string,
): Promise<DocumentoMedico[]> {
  const { data } = await api.get<Envelope<DocumentoMedico[]>>(
    `/pacientes/${pacienteId}/documentos`,
  );
  return data.data;
}

export async function criarDocumento(
  pacienteId: string,
  payload: DocumentoPayload,
): Promise<DocumentoMedico> {
  const { data } = await api.post<Envelope<DocumentoMedico>>(
    `/pacientes/${pacienteId}/documentos`,
    payload,
  );
  return data.data;
}

export function baixarDocumentoPdf(
  id: string,
  tipo: TipoDocumento,
  token: string,
): Promise<void> {
  return downloadAutenticado(
    apiUrl(`/documentos/${id}/pdf`, {}),
    token,
    `${tipo.toLowerCase()}-${id}.pdf`,
  );
}
