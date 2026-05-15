import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { listPendentes, reenviar } from '../api/whatsapp';
import type { MensagemStatus } from '../types/whatsapp';

function statusColor(s: MensagemStatus): { bg: string; fg: string } {
  const map: Record<MensagemStatus, { bg: string; fg: string }> = {
    PENDENTE: { bg: '#fef3c7', fg: '#92400e' },
    ENVIADA: { bg: '#e0e7ff', fg: '#3730a3' },
    ENTREGUE: { bg: '#dcfce7', fg: '#166534' },
    RESPONDIDA: { bg: '#ccfbf1', fg: '#115e59' },
    FALHA: { bg: '#fee2e2', fg: '#991b1b' },
    CANCELADA: { bg: '#f1f5f9', fg: '#475569' },
  };
  return map[s];
}

export default function WhatsappPendentesPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wa-pendentes'],
    queryFn: listPendentes,
    refetchInterval: 30_000,
  });

  async function handleReenviar(id: string) {
    await reenviar(id);
    qc.invalidateQueries({ queryKey: ['wa-pendentes'] });
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
        <h1 style={{ margin: 0, color: '#0f172a' }}>WhatsApp — Pendências</h1>
        <button
          onClick={() => refetch()}
          style={{
            padding: '8px 14px',
            border: '1px solid #cbd5e1',
            background: '#fff',
            borderRadius: 6,
          }}
        >
          Atualizar
        </button>
      </div>

      {isLoading && <p>Carregando…</p>}

      {data && data.length === 0 && (
        <div
          style={{
            background: '#fff',
            padding: 32,
            borderRadius: 8,
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          Nenhuma pendência.
        </div>
      )}

      {data && data.length > 0 && (
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
                <Th>Quando</Th>
                <Th>Paciente</Th>
                <Th>Tipo</Th>
                <Th>Status</Th>
                <Th>Tentativas</Th>
                <Th>Erro</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => {
                const sc = statusColor(m.status);
                return (
                  <tr key={m.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <Td>
                      {new Date(m.createdAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </Td>
                    <Td>
                      {m.paciente?.nomeCompleto ?? (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {m.telefone}
                      </div>
                    </Td>
                    <Td>{m.tipo.replace(/_/g, ' ')}</Td>
                    <Td>
                      <span
                        style={{
                          background: sc.bg,
                          color: sc.fg,
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {m.status}
                      </span>
                    </Td>
                    <Td>{m.tentativas}</Td>
                    <Td>
                      <span
                        style={{
                          fontSize: 12,
                          color: '#991b1b',
                          maxWidth: 200,
                          display: 'inline-block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={m.erro ?? ''}
                      >
                        {m.erro ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => handleReenviar(m.id)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          borderRadius: 4,
                        }}
                      >
                        Reenviar
                      </button>
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
    <td style={{ padding: '10px 16px', fontSize: 13, color: '#0f172a' }}>
      {children}
    </td>
  );
}
