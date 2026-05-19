import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { criarBloqueio } from '../api/agenda';

interface Props {
  open: boolean;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm (início sugerido)
  profissionalId?: string;
  profissionalNome?: string;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#334155',
  marginBottom: 4,
};

export default function AgendaSlotModal({
  open,
  data,
  hora,
  profissionalId,
  profissionalNome,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modo, setModo] = useState<'AGENDAR' | 'BLOQUEAR'>('AGENDAR');
  const [horaFim, setHoraFim] = useState(() => {
    const [h, m] = hora.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + 15, 0, 0);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [diaTodo, setDiaTodo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const bloquear = useMutation({
    mutationFn: criarBloqueio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      qc.invalidateQueries({ queryKey: ['bloqueios'] });
      onClose();
    },
    onError: (err) => {
      const e = err as { response?: { data?: { error?: { message?: string | string[] } } } };
      const m = e?.response?.data?.error?.message;
      setErro(Array.isArray(m) ? m.join(', ') : (m ?? 'Erro ao bloquear'));
    },
  });

  if (!open) return null;

  function handleAgendar() {
    const qs = new URLSearchParams({
      data,
      hora,
      ...(profissionalId ? { profissionalId } : {}),
    });
    navigate(`/agenda/novo?${qs.toString()}`);
  }

  function handleBloquear(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!profissionalId) {
      setErro('Selecione um profissional na agenda antes');
      return;
    }
    const ini = diaTodo
      ? new Date(`${data}T00:00:00`)
      : new Date(`${data}T${hora}:00`);
    const fim = diaTodo
      ? new Date(`${data}T23:59:00`)
      : new Date(`${data}T${horaFim}:00`);
    if (fim <= ini) {
      setErro('Fim deve ser depois do início');
      return;
    }
    bloquear.mutate({
      profissionalId,
      dataHoraInicio: ini.toISOString(),
      dataHoraFim: fim.toISOString(),
      motivo: motivo.trim() || undefined,
    });
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: 440,
          maxWidth: '90vw',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, color: '#0f766e' }}>
            {modo === 'AGENDAR' ? 'Novo agendamento' : 'Bloquear horário'}
          </h3>
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

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
          >
            <input
              type="radio"
              checked={modo === 'AGENDAR'}
              onChange={() => setModo('AGENDAR')}
            />
            Agendar
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
          >
            <input
              type="radio"
              checked={modo === 'BLOQUEAR'}
              onChange={() => setModo('BLOQUEAR')}
            />
            Bloquear horário
          </label>
        </div>

        <div
          style={{
            background: '#f8fafc',
            padding: 10,
            borderRadius: 6,
            fontSize: 13,
            color: '#475569',
            marginBottom: 16,
          }}
        >
          <strong>{data}</strong> às <strong>{hora}</strong>
          {profissionalNome && (
            <>
              {' · '}
              {profissionalNome}
            </>
          )}
        </div>

        {modo === 'AGENDAR' && (
          <>
            <p style={{ fontSize: 14, color: '#475569', marginTop: 0 }}>
              Continuar para o formulário completo de agendamento?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  borderRadius: 6,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAgendar}
                style={{
                  padding: '8px 16px',
                  background: '#0f766e',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {modo === 'BLOQUEAR' && (
          <form onSubmit={handleBloquear}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              <input
                type="checkbox"
                checked={diaTodo}
                onChange={(e) => setDiaTodo(e.target.checked)}
              />
              Dia todo
            </label>

            {!diaTodo && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label style={labelStyle}>Início</label>
                  <input value={hora} readOnly style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fim</label>
                  <input
                    type="time"
                    value={horaFim}
                    onChange={(e) => setHoraFim(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Motivo (opcional)</label>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                placeholder="Almoço, reunião, férias…"
                style={inputStyle}
              />
            </div>

            {erro && (
              <div
                style={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  padding: 8,
                  borderRadius: 6,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  borderRadius: 6,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={bloquear.isPending}
                style={{
                  padding: '8px 16px',
                  background: bloquear.isPending ? '#94a3b8' : '#0f766e',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {bloquear.isPending ? 'Salvando…' : 'Salvar bloqueio'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
