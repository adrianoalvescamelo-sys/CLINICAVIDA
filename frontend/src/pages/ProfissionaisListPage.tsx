import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listProfissionais } from '../api/profissionais';
import { useAuthStore } from '../store/auth';
import Layout from '../components/Layout';

export default function ProfissionaisListPage() {
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const perfil = useAuthStore((s) => s.user?.perfil);
  const isAdmin = perfil === 'ADMIN';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['profissionais', somenteAtivos],
    queryFn: () => listProfissionais({ ativos: somenteAtivos }),
  });

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
        <h1 style={{ margin: 0, color: '#0f172a' }}>Profissionais</h1>
        {isAdmin && (
          <Link
            to="/profissionais/novo"
            style={{
              padding: '10px 16px',
              background: '#0f766e',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            + Novo profissional
          </Link>
        )}
      </div>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          color: '#334155',
          marginBottom: 16,
        }}
      >
        <input
          type="checkbox"
          checked={somenteAtivos}
          onChange={(e) => setSomenteAtivos(e.target.checked)}
        />
        Apenas ativos
      </label>

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>
          Erro ao carregar: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          {data.length === 0 ? (
            <div
              style={{
                background: '#fff',
                padding: 32,
                borderRadius: 8,
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              Nenhum profissional cadastrado.
            </div>
          ) : (
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
                    <Th>Cor</Th>
                    <Th>Nome</Th>
                    <Th>Especialidade</Th>
                    <Th>Conselho</Th>
                    <Th>Tipo</Th>
                    <Th>Status</Th>
                    <Th>{' '}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <Td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            background: p.cor ?? '#94a3b8',
                            border: '1px solid #cbd5e1',
                          }}
                        />
                      </Td>
                      <Td>{p.nomeCompleto}</Td>
                      <Td>{p.especialidade ?? '—'}</Td>
                      <Td>{p.registroConselho ?? '—'}</Td>
                      <Td>{p.ehMedico ? 'Médico' : 'Profissional'}</Td>
                      <Td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: p.ativo ? '#dcfce7' : '#fee2e2',
                            color: p.ativo ? '#166534' : '#991b1b',
                          }}
                        >
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </Td>
                      <Td>
                        {isAdmin && (
                          <Link
                            to={`/profissionais/${p.id}`}
                            style={{
                              color: '#0f766e',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            Editar
                          </Link>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p
            style={{
              marginTop: 16,
              fontSize: 14,
              color: '#64748b',
            }}
          >
            {data.length} profissional(is)
          </p>
        </>
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

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a' }}>
      {children}
    </td>
  );
}
