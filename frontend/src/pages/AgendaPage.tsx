import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import {
  chamarAgendamento,
  alterarStatus,
  listAgendamentos,
  listProfissionais,
  marcarAgendamentoAtendido,
} from '../api/agenda';
import type { AgendamentoStatus } from '../types/agenda';
import { Link } from 'react-router-dom';
import { clinicDayKey } from '../utils/clinic-date';

function statusBadge(s: AgendamentoStatus): { bg: string; fg: string } {
  const map: Record<AgendamentoStatus, { bg: string; fg: string }> = {
    SOLICITADO: { bg: '#e0e7ff', fg: '#3730a3' },
    PRE_AGENDAMENTO: { bg: '#fef3c7', fg: '#92400e' },
    CONFIRMADO: { bg: '#dcfce7', fg: '#166534' },
    CONFIRMACAO_TARDIA: { bg: '#fde68a', fg: '#92400e' },
    AGUARDANDO: { bg: '#e0f2fe', fg: '#075985' },
    EM_ATENDIMENTO: { bg: '#ccfbf1', fg: '#115e59' },
    ATENDIDO: { bg: '#dcfce7', fg: '#14532d' },
    FALTOU: { bg: '#fee2e2', fg: '#991b1b' },
    CANCELADO: { bg: '#f1f5f9', fg: '#475569' },
  };
  return map[s];
}

export default function AgendaPage() {
  const [data, setData] = useState(clinicDayKey(new Date()));
  const [profissionalId, setProfissionalId] = useState<string>('');
  const qc = useQueryClient();

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => listProfissionais(true),
  });

  const inicio = `${data}T00:00:00.000Z`;
  const fim = `${data}T23:59:59.999Z`;

  const { data: agendamentos, isLoading } = useQuery({
    queryKey: ['agendamentos', data, profissionalId],
    queryFn: () =>
      listAgendamentos({
        inicio,
        fim,
        profissionalId: profissionalId || undefined,
      }),
  });

  async function handleStatus(id: string, s: AgendamentoStatus) {
    const motivo =
      s === 'CANCELADO'
        ? window.prompt('Motivo do cancelamento (opcional)') ?? undefined
        : undefined;
    await alterarStatus(id, s, motivo || undefined);
    qc.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  async function handleChamar(id: string) {
    await chamarAgendamento(id);
    qc.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  async function handleAtendido(id: string) {
    await marcarAgendamentoAtendido(id);
    qc.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  return (
    <Layout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, color: '#0f172a' }}>Agenda</h1>
        <Link
          to="/agenda/novo"
          style={{
            padding: '10px 16px',
            background: '#0f766e',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + Novo agendamento
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          style={inputStyle}
        />
        <select
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
          style={{ ...inputStyle, minWidth: 220 }}
        >
          <option value="">Todos profissionais</option>
          {profissionais?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nomeCompleto}
              {p.especialidade ? ` · ${p.especialidade}` : ''}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Carregando…</p>}

      {agendamentos && agendamentos.length === 0 && (
        <div
          style={{
            background: '#fff',
            padding: 32,
            borderRadius: 8,
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          Nenhum agendamento neste dia.
        </div>
      )}

      {agendamentos && agendamentos.length > 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <Th>Hora</Th>
                <Th>Paciente</Th>
                <Th>Profissional</Th>
                <Th>Tipo</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {agendamentos.map((a) => {
                const ini = new Date(a.dataHoraInicio);
                const f = new Date(a.dataHoraFim);
                const sb = statusBadge(a.status);
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <Td>
                      {ini.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      –{' '}
                      {f.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                    </Td>
                    <Td>{a.paciente.nomeCompleto}</Td>
                    <Td>
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
                    </Td>
                    <Td>{a.tipo}</Td>
                    <Td>
                      <span
                        style={{
                          background: sb.bg,
                          color: sb.fg,
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {a.status}
                      </span>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {a.status === 'SOLICITADO' && (
                          <ActionBtn
                            onClick={() => handleStatus(a.id, 'CONFIRMADO')}
                          >
                            Confirmar
                          </ActionBtn>
                        )}
                        {a.status === 'PRE_AGENDAMENTO' && (
                          <ActionBtn
                            onClick={() => handleStatus(a.id, 'CONFIRMADO')}
                          >
                            Aprovar
                          </ActionBtn>
                        )}
                        {a.status === 'AGUARDANDO' && (
                          <ActionBtn onClick={() => handleChamar(a.id)}>
                            Chamar
                          </ActionBtn>
                        )}
                        {a.status === 'EM_ATENDIMENTO' && (
                          <ActionBtn onClick={() => handleAtendido(a.id)}>
                            Atendido
                          </ActionBtn>
                        )}
                        {[
                          'SOLICITADO',
                          'PRE_AGENDAMENTO',
                          'CONFIRMADO',
                          'CONFIRMACAO_TARDIA',
                        ].includes(a.status) && (
                          <ActionBtn
                            onClick={() => handleStatus(a.id, 'CANCELADO')}
                            danger
                          >
                            Cancelar
                          </ActionBtn>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 16px',
        fontSize: 12,
        fontWeight: 600,
        color: '#475569',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '10px 16px', fontSize: 14, color: '#0f172a' }}>
      {children}
    </td>
  );
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        border: `1px solid ${danger ? '#fca5a5' : '#cbd5e1'}`,
        background: '#fff',
        color: danger ? '#991b1b' : '#0f172a',
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}
