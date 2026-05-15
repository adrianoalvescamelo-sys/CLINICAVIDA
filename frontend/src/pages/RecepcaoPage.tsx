import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { listProfissionais } from '../api/agenda';
import { listPacientes } from '../api/pacientes';
import {
  atualizarListaEspera,
  criarListaEspera,
  marcarAgendado,
  ofertarVaga,
  registrarRecusa,
} from '../api/lista-espera';
import { obterDashboardRecepcao } from '../api/recepcao';
import ListaEsperaForm from '../components/ListaEsperaForm';
import type { AgendamentoListItem, AgendamentoStatus } from '../types/agenda';
import type {
  CriarListaEsperaPayload,
  ListaEsperaItem,
} from '../types/lista-espera';
import type { MensagemWhatsapp } from '../types/whatsapp';

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

const statusOptions: AgendamentoStatus[] = [
  'SOLICITADO',
  'PRE_AGENDAMENTO',
  'CONFIRMADO',
  'CONFIRMACAO_TARDIA',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
  'ATENDIDO',
  'FALTOU',
  'CANCELADO',
];

export default function RecepcaoPage() {
  const [data, setData] = useState(isoDay(new Date()));
  const [profissionalId, setProfissionalId] = useState('');
  const [status, setStatus] = useState<AgendamentoStatus | ''>('');
  const qc = useQueryClient();

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => listProfissionais(true),
  });

  const { data: pacientes } = useQuery({
    queryKey: ['pacientes', 'recepcao-form'],
    queryFn: () => listPacientes({ limite: 100 }),
  });

  const { data: dashboard, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['recepcao-dashboard', data, profissionalId, status],
    queryFn: () =>
      obterDashboardRecepcao({
        data,
        profissionalId: profissionalId || undefined,
        status: status || undefined,
      }),
    refetchInterval: 30_000,
  });

  async function reloadDashboard() {
    await qc.invalidateQueries({ queryKey: ['recepcao-dashboard'] });
  }

  async function handleCriarListaEspera(payload: CriarListaEsperaPayload) {
    await criarListaEspera(payload);
    await reloadDashboard();
  }

  async function handlePrioridade(item: ListaEsperaItem) {
    const value = window.prompt(
      'Nova prioridade (0 a 999)',
      String(item.prioridade),
    );
    if (value === null) return;
    const prioridade = Number(value);
    if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 999) {
      window.alert('Prioridade invalida.');
      return;
    }
    await atualizarListaEspera(item.id, { prioridade });
    await reloadDashboard();
  }

  async function handleRecusa(item: ListaEsperaItem) {
    const motivoRecusa =
      window.prompt('Motivo da recusa (opcional)') ?? undefined;
    await registrarRecusa(item.id, { motivoRecusa });
    await reloadDashboard();
  }

  async function handleOfertar(item: ListaEsperaItem) {
    await ofertarVaga(item.id);
    await reloadDashboard();
  }

  async function handleAgendado(item: ListaEsperaItem) {
    await marcarAgendado(item.id);
    await reloadDashboard();
  }

  return (
    <Layout>
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#0f172a', margin: 0 }}>Recepcao</h1>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Operacao do dia em tempo quase real
          </div>
        </div>
        <button onClick={() => refetch()} style={buttonStyle}>
          Atualizar
        </button>
      </div>

      <div style={filtersStyle}>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          style={inputStyle}
        />
        <select
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
          style={{ ...inputStyle, minWidth: 240 }}
        >
          <option value="">Todos profissionais</option>
          {profissionais?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nomeCompleto}
              {p.especialidade ? ` - ${p.especialidade}` : ''}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AgendamentoStatus | '')}
          style={{ ...inputStyle, minWidth: 210 }}
        >
          <option value="">Todos status</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {labelStatus(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Carregando...</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>
          Erro ao carregar recepcao: {(error as Error).message}
        </p>
      )}

      {dashboard && (
        <>
          <div style={metricsGridStyle}>
            <Metric label="Agenda" value={dashboard.agendaDoDia.length} />
            <Metric label="Aguardando" value={dashboard.aguardando.length} />
            <Metric
              label="Em atendimento"
              value={dashboard.emAtendimento.length}
            />
            <Metric
              label="Confirmacoes"
              value={dashboard.confirmacoesPendentes.length}
            />
            <Metric
              label="WhatsApp"
              value={dashboard.mensagensPendentes.length}
            />
            <Metric label="Lista espera" value={dashboard.listaEspera.length} />
          </div>

          <div style={contentGridStyle}>
            <Panel title="Agenda do dia">
              <AgendamentoTable items={dashboard.agendaDoDia} />
            </Panel>

            <div style={{ display: 'grid', gap: 16 }}>
              <Panel title="Pacientes aguardando">
                <AgendamentoList items={dashboard.aguardando} />
              </Panel>
              <Panel title="Em atendimento">
                <AgendamentoList items={dashboard.emAtendimento} />
              </Panel>
              <Panel title="Confirmacoes pendentes">
                <AgendamentoList items={dashboard.confirmacoesPendentes} />
              </Panel>
            </div>

            <Panel title="WhatsApp pendente">
              <MensagemList items={dashboard.mensagensPendentes} />
            </Panel>

            <Panel title="Lista de espera">
              <ListaEsperaForm
                pacientes={pacientes?.itens ?? []}
                profissionais={profissionais ?? []}
                onSubmit={handleCriarListaEspera}
                disabled={!pacientes || !profissionais}
              />
              <ListaEsperaList
                items={dashboard.listaEspera}
                onPrioridade={handlePrioridade}
                onOfertar={handleOfertar}
                onRecusa={handleRecusa}
                onAgendado={handleAgendado}
              />
            </Panel>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
            Atualizado em{' '}
            {new Date(dashboard.generatedAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </>
      )}
    </Layout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metricStyle}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, color: '#0f172a', fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelTitleStyle}>{title}</div>
      {children}
    </section>
  );
}

function AgendamentoTable({ items }: { items: AgendamentoListItem[] }) {
  if (items.length === 0) return <Empty>Nenhum agendamento.</Empty>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <Th>Hora</Th>
          <Th>Paciente</Th>
          <Th>Profissional</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} style={{ borderTop: '1px solid #e2e8f0' }}>
            <Td>{formatTime(item.dataHoraInicio)}</Td>
            <Td>{item.paciente.nomeCompleto}</Td>
            <Td>{item.profissional.nomeCompleto}</Td>
            <Td>
              <StatusBadge status={item.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AgendamentoList({ items }: { items: AgendamentoListItem[] }) {
  if (items.length === 0) return <Empty>Nenhum item.</Empty>;

  return (
    <div>
      {items.map((item) => (
        <Row key={item.id}>
          <div>
            <strong>{item.paciente.nomeCompleto}</strong>
            <div style={mutedStyle}>
              {formatTime(item.dataHoraInicio)} - {item.profissional.nomeCompleto}
            </div>
          </div>
          <StatusBadge status={item.status} />
        </Row>
      ))}
    </div>
  );
}

function MensagemList({ items }: { items: MensagemWhatsapp[] }) {
  if (items.length === 0) return <Empty>Nenhuma pendencia.</Empty>;

  return (
    <div>
      {items.map((item) => (
        <Row key={item.id}>
          <div>
            <strong>{item.paciente?.nomeCompleto ?? item.telefone}</strong>
            <div style={mutedStyle}>
              {item.tipo.replace(/_/g, ' ')} - {item.status}
            </div>
          </div>
          <span style={countStyle}>{item.tentativas}</span>
        </Row>
      ))}
    </div>
  );
}

function ListaEsperaList({
  items,
  onPrioridade,
  onOfertar,
  onRecusa,
  onAgendado,
}: {
  items: ListaEsperaItem[];
  onPrioridade: (item: ListaEsperaItem) => void;
  onOfertar: (item: ListaEsperaItem) => void;
  onRecusa: (item: ListaEsperaItem) => void;
  onAgendado: (item: ListaEsperaItem) => void;
}) {
  if (items.length === 0) return <Empty>Ninguem na lista.</Empty>;

  return (
    <div>
      {items.map((item) => (
        <Row key={item.id}>
          <div>
            <strong>{item.paciente.nomeCompleto}</strong>
            <div style={mutedStyle}>
              {item.profissional?.nomeCompleto ??
                item.especialidade ??
                'Sem profissional definido'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => onPrioridade(item)}
              style={smallButtonStyle}
              title="Alterar prioridade"
            >
              {item.prioridade}
            </button>
            {item.status === 'ATIVO' && (
              <button onClick={() => onOfertar(item)} style={smallButtonStyle}>
                Ofertar
              </button>
            )}
            {item.status === 'CONTATADO' && (
              <>
                <button
                  onClick={() => onAgendado(item)}
                  style={smallButtonStyle}
                >
                  Agendado
                </button>
                <button
                  onClick={() => onRecusa(item)}
                  style={{ ...smallButtonStyle, color: '#991b1b' }}
                >
                  Recusa
                </button>
              </>
            )}
          </div>
        </Row>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: AgendamentoStatus }) {
  const colors: Record<AgendamentoStatus, { bg: string; fg: string }> = {
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
  const c = colors[status];
  return (
    <span style={{ ...badgeStyle, background: c.bg, color: c.fg }}>
      {labelStatus(status)}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={rowStyle}>{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={emptyStyle}>{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function labelStatus(status: AgendamentoStatus) {
  return status.replace(/_/g, ' ');
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  marginBottom: 16,
};

const filtersStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginBottom: 16,
};

const metricsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
  marginBottom: 16,
};

const contentGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.8fr)',
  gap: 16,
  alignItems: 'start',
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 6,
  fontWeight: 600,
};

const panelStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const panelTitleStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 700,
  color: '#0f172a',
};

const metricStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 16px',
  borderTop: '1px solid #e2e8f0',
  fontSize: 13,
  color: '#0f172a',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  marginTop: 2,
};

const countStyle: React.CSSProperties = {
  minWidth: 32,
  height: 28,
  borderRadius: 4,
  background: '#f1f5f9',
  color: '#334155',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
};

const smallButtonStyle: React.CSSProperties = {
  minHeight: 28,
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 700,
};

const badgeStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  color: '#64748b',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  color: '#0f172a',
};
