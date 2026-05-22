import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { atualizarAgendamento } from '../api/agenda';
import { listProfissionais } from '../api/profissionais';
import type { AgendamentoListItem } from '../types/agenda';
import { useModalA11y } from '../hooks/useModalA11y';

interface Props {
  agendamento: AgendamentoListItem | null;
  onClose: () => void;
  onSaved?: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 10,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#334155',
  marginBottom: 4,
};

function toLocalDate(iso: string) {
  return iso.slice(0, 10);
}

function toLocalTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function diferencaMin(ini: string, fim: string) {
  return Math.round((new Date(fim).getTime() - new Date(ini).getTime()) / 60000);
}

export default function AgendamentoEditarModal({
  agendamento,
  onClose,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(!!agendamento, onClose, dialogRef);

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', true],
    queryFn: () => listProfissionais({ ativos: true }),
  });

  const [data, setData] = useState('');
  const [horaIni, setHoraIni] = useState('');
  const [duracao, setDuracao] = useState(30);
  const [profissionalId, setProfissionalId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  useEffect(() => {
    if (agendamento) {
      setData(toLocalDate(agendamento.dataHoraInicio));
      setHoraIni(toLocalTime(agendamento.dataHoraInicio));
      setDuracao(
        diferencaMin(agendamento.dataHoraInicio, agendamento.dataHoraFim),
      );
      setProfissionalId(agendamento.profissionalId);
      setErro(null);
      setErroDetalhes(null);
    }
  }, [agendamento]);

  const salvar = useMutation({
    mutationFn: (a: AgendamentoListItem) => {
      const inicio = new Date(`${data}T${horaIni}:00`);
      const fim = new Date(inicio.getTime() + duracao * 60_000);
      return atualizarAgendamento(a.id, {
        dataHoraInicio: inicio.toISOString(),
        dataHoraFim: fim.toISOString(),
        profissionalId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      const e = err as {
        response?: {
          data?: {
            error?: {
              message?: string | string[];
              details?: Record<string, unknown> | null;
            };
          };
        };
        message?: string;
      };
      const apiErr = e?.response?.data?.error;
      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message.join(', ')
        : (apiErr?.message ?? e?.message ?? 'Erro ao salvar');
      setErro(msg);
      setErroDetalhes(apiErr?.details ?? null);
    },
  });

  if (!agendamento) return null;
  const a = agendamento;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);
    if (!data || !horaIni || !profissionalId || duracao < 5) {
      setErro('Preencha todos os campos obrigatórios');
      return;
    }
    salvar.mutate(a);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 110,
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
          width: 520,
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
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>Remarcar agendamento</h3>
            <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 13 }}>
              {a.paciente.nomeCompleto}
            </p>
          </div>
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Profissional *</label>
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              required
              style={inputStyle}
            >
              {profissionais?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeCompleto}
                  {p.especialidade ? ` · ${p.especialidade}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Data *</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Hora *</label>
              <input
                type="time"
                value={horaIni}
                onChange={(e) => setHoraIni(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Duração (min) *</label>
              <input
                type="number"
                min={5}
                max={240}
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value))}
                required
                style={inputStyle}
              />
            </div>
          </div>

          {erro && (
            <div
              role="alert"
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              <div>{erro}</div>
              {erroDetalhes !== null && (
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    color: '#7f1d1d',
                  }}
                >
                  {JSON.stringify(erroDetalhes, null, 2)}
                </pre>
              )}
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
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvar.isPending}
              style={{
                padding: '8px 16px',
                background: salvar.isPending ? '#94a3b8' : '#0f766e',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
