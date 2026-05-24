import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarDocumentos, baixarDocumentoPdf } from '../api/documentos';
import { useAuthStore } from '../store/auth';
import { LABEL_TIPO } from '../types/documento';
import DocumentoFormModal from './DocumentoFormModal';

export default function DocumentosTab({ pacienteId }: { pacienteId: string }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token) ?? '';
  const podeEscrever = user?.perfil === 'MEDICO' || user?.perfil === 'PROFISSIONAL_NAO_MEDICO';
  const [novoOpen, setNovoOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['documentos', pacienteId],
    queryFn: () => listarDocumentos(pacienteId),
  });

  if (isLoading) return <p>Carregando&#8230;</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;

  const docs = data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {podeEscrever && (
          <button onClick={() => setNovoOpen(true)} style={primaryBtn}>+ Novo documento</button>
        )}
      </div>

      {docs.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Nenhum documento emitido.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Tipo</th><th style={th}>Emitido em</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={td}>{LABEL_TIPO[d.tipo]}</td>
                <td style={td}>{new Date(d.createdAt).toLocaleString('pt-BR')}</td>
                <td style={td}>
                  <button onClick={() => baixarDocumentoPdf(d.id, d.tipo, token)} style={linkBtn}>
                    Baixar PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <DocumentoFormModal
        open={novoOpen}
        pacienteId={pacienteId}
        onClose={() => setNovoOpen(false)}
        onSaved={() => { setNovoOpen(false); void refetch(); }}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  padding: 0, border: 'none', background: 'none', color: '#1d4ed8',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#475569' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#0f172a' };
