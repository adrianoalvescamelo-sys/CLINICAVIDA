import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  alterarStatus,
  chamarAgendamento,
  marcarAgendamentoAtendido,
} from '../api/agenda';
import type { AgendamentoListItem, AgendamentoStatus } from '../types/agenda';

interface Props {
  agendamento: AgendamentoListItem | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<AgendamentoStatus, string> = {
  SOLICITADO: 'Solicitado',
  PRE_AGENDAMENTO: 'Pré-agendamento',
  CONFIRMADO: 'Confirmado',
  CONFIRMACAO_TARDIA: 'Confirmação tardia',
  AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em atendimento',
  ATENDIDO: 'Atendido',
  FALTOU: 'Faltou',
  CANCELADO: 'Cancelado',
};

const STATUS_COR: Record<
  AgendamentoStatus,
  { bg: string; fg: string }
> = {
  SOLICITADO: { bg: '#e0e7ff', fg: '#3730a3' },
  PRE_AGENDAMENTO: { bg: '#fef3c7', fg: '#92400e' },
  CONFIRMADO: { bg: '#dbeafe', fg: '#1e40af' },
  CONFIRMACAO_TARDIA: { bg: '#fde68a', fg: '#92400e' },
  AGUARDANDO: { bg: '#e0f2fe', fg: '#075985' },
  EM_ATENDIMENTO: { bg: '#ccfbf1', fg: '#115e59' },
  ATENDIDO: { bg: '#dcfce7', fg: '#14532d' },
  FALTOU: { bg: '#fee2e2', fg: '#991b1b' },
  CANCELADO: { bg: '#f1f5f9', fg: '#475569' },
};

function formatTel(d: string) {
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

export default function AgendamentoDetalheModal({ agendamento, onClose }: Props) {
  const qc = useQueryClient();

  const status = useMutation({
    mutationFn: ({ id, s, motivo }: { id: string; s: AgendamentoStatus; motivo?: string }) =>
      alterarStatus(id, s, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    },
  });

  const chamar = useMutation({
    mutationFn: (id: string) => chamarAgendamento(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    },
  });

  const atendido = useMutation({
    mutationFn: (id: string) => marcarAgendamentoAtendido(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    },
  });

  if (!agendamento) return null;
  const a = agendamento;
  const ini = new Date(a.dataHoraInicio);
  const fim = new Date(a.dataHoraFim);
  const cor = STATUS_COR[a.status];

  function handleCancelar() {
    const motivo = window.prompt('Motivo do cancelamento (opcional):') ?? undefined;
    status.mutate({ id: a.id, s: 'CANCELADO', motivo: motivo || undefined });
  }

  function handleFaltou() {
    if (!window.confirm('Marcar como FALTOU?')) return;
    status.mutate({ id: a.id, s: 'FALTOU' });
  }

  const podeConfirmar = ['SOLICITADO', 'PRE_AGENDAMENTO', 'CONFIRMACAO_TARDIA'].includes(
    a.status,
  );
  const podeAguardar = a.status === 'CONFIRMADO';
  const podeChamar = a.status === 'AGUARDANDO';
  const podeAtendido = a.status === 'EM_ATENDIMENTO';
  const podeCancelarFaltou = [
    'SOLICITADO',
    'PRE_AGENDAMENTO',
    'CONFIRMADO',
    'CONFIRMACAO_TARDIA',
    'AGUARDANDO',
  ].includes(a.status);

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
          width: 480,
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
            <h3 style={{ margin: 0, color: '#0f172a' }}>
              {a.paciente.nomeCompleto}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 13 }}>
              {formatTel(a.paciente.telefoneWhatsapp)}
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

        <div
          style={{
            background: '#f8fafc',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            color: '#334155',
            display: 'grid',
            gridTemplateColumns: '120px 1fr',
            rowGap: 6,
          }}
        >
          <strong>Data/Hora:</strong>
          <span>
            {ini.toLocaleDateString('pt-BR')} ·{' '}
            {ini.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            -{' '}
            {fim.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <strong>Profissional:</strong>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: a.profissional.cor ?? '#94a3b8',
                borderRadius: '50%',
                marginRight: 6,
              }}
            />
            {a.profissional.nomeCompleto}
          </span>
          <strong>Tipo:</strong>
          <span>{a.tipo}</span>
          <strong>Origem:</strong>
          <span>{a.origem}</span>
          <strong>Status:</strong>
          <span>
            <span
              style={{
                background: cor.bg,
                color: cor.fg,
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {STATUS_LABEL[a.status]}
            </span>
            {a.encaixe && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  background: '#fde68a',
                  color: '#92400e',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                encaixe
              </span>
            )}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {podeConfirmar && (
            <Btn
              loading={status.isPending}
              onClick={() => status.mutate({ id: a.id, s: 'CONFIRMADO' })}
              color="#0f766e"
            >
              Confirmar
            </Btn>
          )}
          {podeAguardar && (
            <Btn
              loading={status.isPending}
              onClick={() => status.mutate({ id: a.id, s: 'AGUARDANDO' })}
              color="#0ea5e9"
            >
              Marcar Aguardando
            </Btn>
          )}
          {podeChamar && (
            <Btn
              loading={chamar.isPending}
              onClick={() => chamar.mutate(a.id)}
              color="#14b8a6"
            >
              Chamar
            </Btn>
          )}
          {podeAtendido && (
            <Btn
              loading={atendido.isPending}
              onClick={() => atendido.mutate(a.id)}
              color="#16a34a"
            >
              Atendido
            </Btn>
          )}
          {podeCancelarFaltou && (
            <>
              <Btn
                loading={status.isPending}
                onClick={handleFaltou}
                color="#b45309"
              >
                Faltou
              </Btn>
              <Btn
                loading={status.isPending}
                onClick={handleCancelar}
                color="#991b1b"
              >
                Cancelar
              </Btn>
            </>
          )}
          <Btn onClick={onClose} color="#475569" variant="ghost">
            Fechar
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  loading,
  color,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  color: string;
  variant?: 'ghost';
}) {
  const isGhost = variant === 'ghost';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '8px 14px',
        border: `1px solid ${color}`,
        background: isGhost ? '#fff' : color,
        color: isGhost ? color : '#fff',
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 13,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
