import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removerBloqueio, type Bloqueio } from '../api/agenda';
import { useModalA11y } from '../hooks/useModalA11y';

interface Props {
  bloqueio: Bloqueio | null;
  onClose: () => void;
}

export default function BloqueioDetalheModal({ bloqueio, onClose }: Props) {
  const qc = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(!!bloqueio, onClose, dialogRef);

  const remover = useMutation({
    mutationFn: removerBloqueio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloqueios'] });
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    },
  });

  if (!bloqueio) return null;
  const b = bloqueio;
  const ini = new Date(b.dataHoraInicio);
  const fim = new Date(b.dataHoraFim);

  function handleRemover() {
    if (!window.confirm('Remover este bloqueio?')) return;
    remover.mutate(b.id);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxWidth: '92vw',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, color: '#475569' }}>Bloqueio de horário</h3>
          <button
            onClick={onClose}
            style={{
              border: 0,
              background: 'transparent',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background:
              'repeating-linear-gradient(45deg, #e2e8f0 0 6px, #cbd5e1 6px 12px)',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            color: '#1e293b',
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <strong>{b.profissional?.nomeCompleto ?? b.profissionalId}</strong>
          </div>
          <div>
            {ini.toLocaleString('pt-BR')} → {fim.toLocaleString('pt-BR')}
          </div>
          {b.motivo && (
            <div
              style={{ marginTop: 8, fontStyle: 'italic', color: '#475569' }}
            >
              {b.motivo}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#475569',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            Fechar
          </button>
          <button
            onClick={handleRemover}
            disabled={remover.isPending}
            style={{
              padding: '8px 14px',
              background: remover.isPending ? '#94a3b8' : '#991b1b',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              fontWeight: 600,
              cursor: remover.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {remover.isPending ? 'Removendo…' : 'Remover bloqueio'}
          </button>
        </div>
      </div>
    </div>
  );
}
