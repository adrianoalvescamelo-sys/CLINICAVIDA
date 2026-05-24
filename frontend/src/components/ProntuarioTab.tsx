import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProntuario } from '../api/prontuario';
import { useAuthStore } from '../store/auth';
import type { Evolucao } from '../types/prontuario';
import EvolucaoFormModal from './EvolucaoFormModal';
import RetificarEvolucaoModal from './RetificarEvolucaoModal';

export default function ProntuarioTab({ pacienteId }: { pacienteId: string }) {
  const user = useAuthStore((s) => s.user);
  const podeEscrever = user?.perfil === 'MEDICO' || user?.perfil === 'PROFISSIONAL_NAO_MEDICO';
  const [novoOpen, setNovoOpen] = useState(false);
  const [retificar, setRetificar] = useState<Evolucao | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['prontuario', pacienteId],
    queryFn: () => getProntuario(pacienteId),
  });

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;

  const evolucoes = data?.evolucoes ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {podeEscrever && (
          <button onClick={() => setNovoOpen(true)} style={primaryBtn}>
            + Nova evolução
          </button>
        )}
      </div>

      {evolucoes.length === 0 && (
        <p style={{ color: '#64748b', fontSize: 13 }}>Nenhuma evolução registrada.</p>
      )}

      {evolucoes.map((e) => (
        <div key={e.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{new Date(e.createdAt).toLocaleString('pt-BR')}</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {e.versao > 1 ? `retificada (v${e.versao})` : `v${e.versao}`}
            </span>
          </div>
          {e.queixaPrincipal && <Campo label="Queixa principal" valor={e.queixaPrincipal} />}
          <Campo label="Subjetivo" valor={e.subjetivo} />
          <Campo label="Objetivo" valor={e.objetivo} />
          <Campo label="Avaliação" valor={e.avaliacao} />
          <Campo label="Plano" valor={e.plano} />
          {podeEscrever && e.autorUsuarioId === user?.id && (
            <button onClick={() => setRetificar(e)} style={linkBtn}>
              Retificar
            </button>
          )}
        </div>
      ))}

      <EvolucaoFormModal
        open={novoOpen}
        pacienteId={pacienteId}
        onClose={() => setNovoOpen(false)}
        onSaved={() => { setNovoOpen(false); refetch(); }}
      />
      <RetificarEvolucaoModal
        evolucao={retificar}
        onClose={() => setRetificar(null)}
        onSaved={() => { setRetificar(null); refetch(); }}
      />
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{valor}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 12, background: '#fff',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  marginTop: 8, padding: 0, border: 'none', background: 'none', color: '#1d4ed8',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
