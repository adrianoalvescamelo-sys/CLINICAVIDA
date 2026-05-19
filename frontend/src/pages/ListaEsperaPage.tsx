import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listarListaEspera,
  ofertarVaga,
  registrarRecusa,
  marcarAgendado,
  atualizarListaEspera,
} from '../api/lista-espera';
import { listProfissionais } from '../api/profissionais';
import Layout from '../components/Layout';
import type {
  ListaEsperaItem,
  ListaEsperaStatus,
} from '../types/lista-espera';

const STATUS_LABELS: Record<ListaEsperaStatus, string> = {
  ATIVO: 'Ativo',
  CONTATADO: 'Contatado',
  RECUSADO: 'Recusado',
  AGENDADO: 'Agendado',
  CANCELADO: 'Cancelado',
};

const STATUS_COLORS: Record<ListaEsperaStatus, { bg: string; fg: string }> = {
  ATIVO: { bg: '#dbeafe', fg: '#1e40af' },
  CONTATADO: { bg: '#fef3c7', fg: '#78350f' },
  RECUSADO: { bg: '#fee2e2', fg: '#991b1b' },
  AGENDADO: { bg: '#dcfce7', fg: '#166534' },
  CANCELADO: { bg: '#f1f5f9', fg: '#475569' },
};

function formatTel(d: string) {
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

export default function ListaEsperaPage() {
  const [statusFiltro, setStatusFiltro] = useState<ListaEsperaStatus | ''>(
    'ATIVO',
  );
  const [profissionalFiltro, setProfissionalFiltro] = useState('');
  const qc = useQueryClient();

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', true],
    queryFn: () => listProfissionais({ ativos: true }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['lista-espera', statusFiltro, profissionalFiltro],
    queryFn: () =>
      listarListaEspera({
        status: statusFiltro || undefined,
        profissionalId: profissionalFiltro || undefined,
        limit: 100,
      }),
  });

  const ofertar = useMutation({
    mutationFn: (id: string) => ofertarVaga(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-espera'] }),
  });

  const recusar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      registrarRecusa(id, { motivoRecusa: motivo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-espera'] }),
  });

  const agendar = useMutation({
    mutationFn: (id: string) => marcarAgendado(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-espera'] }),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      atualizarListaEspera(id, { status: 'CANCELADO' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-espera'] }),
  });

  async function handleRecusa(item: ListaEsperaItem) {
    const motivo = window.prompt('Motivo da recusa (opcional):') ?? undefined;
    recusar.mutate({ id: item.id, motivo: motivo || undefined });
  }

  async function handleCancelar(item: ListaEsperaItem) {
    if (
      !window.confirm(
        `Cancelar ${item.paciente.nomeCompleto} da lista de espera?`,
      )
    )
      return;
    cancelar.mutate(item.id);
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
        <h1 style={{ margin: 0, color: '#0f172a' }}>Lista de espera</h1>
        <Link
          to="/lista-espera/novo"
          style={{
            padding: '10px 16px',
            background: '#0f766e',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + Adicionar paciente
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label
            style={{ display: 'block', fontSize: 13, color: '#475569' }}
          >
            Status
          </label>
          <select
            value={statusFiltro}
            onChange={(e) =>
              setStatusFiltro(e.target.value as ListaEsperaStatus | '')
            }
            style={{
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              minWidth: 160,
            }}
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: 13, color: '#475569' }}
          >
            Profissional
          </label>
          <select
            value={profissionalFiltro}
            onChange={(e) => setProfissionalFiltro(e.target.value)}
            style={{
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              minWidth: 240,
            }}
          >
            <option value="">Todos</option>
            {profissionais?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomeCompleto}{' '}
                {p.especialidade ? `· ${p.especialidade}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>
      )}

      {data && data.items.length === 0 && (
        <div
          style={{
            background: '#fff',
            padding: 32,
            borderRadius: 8,
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          Nenhum paciente na lista de espera com esses filtros.
        </div>
      )}

      {data && data.items.length > 0 && (
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
                <Th>Prio</Th>
                <Th>Paciente</Th>
                <Th>WhatsApp</Th>
                <Th>Profissional/Espec.</Th>
                <Th>Status</Th>
                <Th>Última oferta</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <Td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        background:
                          item.prioridade > 0 ? '#fee2e2' : '#f1f5f9',
                        color: item.prioridade > 0 ? '#991b1b' : '#475569',
                      }}
                    >
                      {item.prioridade}
                    </span>
                  </Td>
                  <Td>{item.paciente.nomeCompleto}</Td>
                  <Td>{formatTel(item.paciente.telefoneWhatsapp)}</Td>
                  <Td>
                    {item.profissional?.nomeCompleto ??
                      item.especialidade ??
                      '—'}
                  </Td>
                  <Td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: STATUS_COLORS[item.status].bg,
                        color: STATUS_COLORS[item.status].fg,
                      }}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </Td>
                  <Td>
                    {item.ultimaOfertaEm
                      ? new Date(item.ultimaOfertaEm).toLocaleString('pt-BR')
                      : '—'}
                  </Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>
                    {item.status === 'ATIVO' && (
                      <ActionBtn
                        onClick={() => ofertar.mutate(item.id)}
                        loading={ofertar.isPending}
                        color="#0f766e"
                      >
                        Ofertar
                      </ActionBtn>
                    )}
                    {item.status === 'CONTATADO' && (
                      <>
                        <ActionBtn
                          onClick={() => agendar.mutate(item.id)}
                          loading={agendar.isPending}
                          color="#166534"
                        >
                          Agendou
                        </ActionBtn>
                        <ActionBtn
                          onClick={() => handleRecusa(item)}
                          loading={recusar.isPending}
                          color="#b45309"
                        >
                          Recusou
                        </ActionBtn>
                      </>
                    )}
                    {(item.status === 'ATIVO' ||
                      item.status === 'CONTATADO') && (
                      <ActionBtn
                        onClick={() => handleCancelar(item)}
                        loading={cancelar.isPending}
                        color="#991b1b"
                      >
                        Cancelar
                      </ActionBtn>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p style={{ marginTop: 16, fontSize: 14, color: '#64748b' }}>
          {data.items.length} registro(s)
          {data.nextCursor && ' — mais disponíveis (paginação simples)'}
        </p>
      )}
    </Layout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '12px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: '#475569',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: '12px 16px',
        fontSize: 14,
        color: '#0f172a',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function ActionBtn({
  children,
  onClick,
  loading,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        marginRight: 8,
        padding: '6px 10px',
        border: `1px solid ${color}`,
        background: '#fff',
        color,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
