import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import AgendaSemana from '../components/AgendaSemana';
import AgendamentoDetalheModal from '../components/AgendamentoDetalheModal';
import {
  chamarAgendamento,
  alterarStatus,
  listAgendamentos,
  marcarAgendamentoAtendido,
} from '../api/agenda';
import { listProfissionais } from '../api/profissionais';
import type { AgendamentoListItem, AgendamentoStatus } from '../types/agenda';
import { clinicDayKey } from '../utils/clinic-date';

type Vista = 'DIA' | 'SEMANA';

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

function inicioSemana(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // volta pro domingo
  return x;
}

function fmtSemana(ini: Date): string {
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 6);
  return `${ini.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })} – ${fim.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })}`;
}

export default function AgendaPage() {
  const [vista, setVista] = useState<Vista>('SEMANA');
  const [data, setData] = useState(clinicDayKey(new Date()));
  const [semanaIni, setSemanaIni] = useState(() => inicioSemana(new Date()));
  const [profissionalId, setProfissionalId] = useState<string>('');
  const [detalheAg, setDetalheAg] = useState<AgendamentoListItem | null>(null);
  const qc = useQueryClient();

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', true],
    queryFn: () => listProfissionais({ ativos: true }),
  });

  const profissionalSelecionado = useMemo(
    () => profissionais?.find((p) => p.id === profissionalId),
    [profissionais, profissionalId],
  );

  const inicio = `${data}T00:00:00.000Z`;
  const fim = `${data}T23:59:59.999Z`;

  const { data: agendamentos, isLoading } = useQuery({
    queryKey: ['agendamentos', data, profissionalId, vista],
    queryFn: () =>
      listAgendamentos({
        inicio,
        fim,
        profissionalId: profissionalId || undefined,
      }),
    enabled: vista === 'DIA',
  });

  async function handleStatus(id: string, s: AgendamentoStatus) {
    const motivo =
      s === 'CANCELADO'
        ? (window.prompt('Motivo do cancelamento (opcional)') ?? undefined)
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

  function navSemana(delta: number) {
    const novo = new Date(semanaIni);
    novo.setDate(novo.getDate() + delta * 7);
    setSemanaIni(novo);
  }

  function hojeAction() {
    if (vista === 'DIA') setData(clinicDayKey(new Date()));
    else setSemanaIni(inicioSemana(new Date()));
  }

  function navDia(delta: number) {
    const d = new Date(`${data}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setData(clinicDayKey(d));
  }

  function handleAgendamentoClick(a: AgendamentoListItem) {
    setDetalheAg(a);
  }

  return (
    <Layout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, color: '#0f172a' }}>Agenda</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to="/bloqueios"
            style={{
              padding: '10px 16px',
              background: '#fff',
              color: '#0f766e',
              border: '1px solid #0f766e',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Bloqueios
          </Link>
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
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
          <TabBtn ativa={vista === 'DIA'} onClick={() => setVista('DIA')}>
            Dia
          </TabBtn>
          <TabBtn ativa={vista === 'SEMANA'} onClick={() => setVista('SEMANA')}>
            Semana
          </TabBtn>
        </div>

        {vista === 'DIA' ? (
          <>
            <button onClick={() => navDia(-1)} style={navBtn}>
              ‹
            </button>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              style={inputStyle}
            />
            <button onClick={() => navDia(1)} style={navBtn}>
              ›
            </button>
          </>
        ) : (
          <>
            <button onClick={() => navSemana(-1)} style={navBtn}>
              ‹
            </button>
            <span
              style={{
                padding: '8px 12px',
                fontSize: 14,
                color: '#0f172a',
                background: '#f1f5f9',
                borderRadius: 6,
                minWidth: 180,
                textAlign: 'center',
              }}
            >
              {fmtSemana(semanaIni)}
            </span>
            <button onClick={() => navSemana(1)} style={navBtn}>
              ›
            </button>
          </>
        )}

        <button onClick={hojeAction} style={navBtn}>
          Hoje
        </button>

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

      {vista === 'SEMANA' ? (
        <AgendaSemana
          semanaInicio={semanaIni}
          profissionalId={profissionalId || undefined}
          profissionalNome={profissionalSelecionado?.nomeCompleto}
          onAgendamentoClick={handleAgendamentoClick}
        />
      ) : (
        <>
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
                      <tr
                        key={a.id}
                        style={{
                          borderTop: '1px solid #e2e8f0',
                          cursor: 'pointer',
                        }}
                        onClick={() => setDetalheAg(a)}
                      >
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
        </>
      )}

      <AgendamentoDetalheModal
        agendamento={detalheAg}
        onClose={() => setDetalheAg(null)}
      />
    </Layout>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};

const navBtn: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

function TabBtn({
  ativa,
  children,
  onClick,
}: {
  ativa: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        border: '1px solid #cbd5e1',
        background: ativa ? '#0f766e' : '#fff',
        color: ativa ? '#fff' : '#0f172a',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
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
