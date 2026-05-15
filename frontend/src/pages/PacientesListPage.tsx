import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listPacientes } from '../api/pacientes';
import Layout from '../components/Layout';

function formatCpf(d: string) {
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatTel(d: string) {
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

export default function PacientesListPage() {
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const limite = 20;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pacientes', q, pagina],
    queryFn: () => listPacientes({ q: q || undefined, pagina, limite }),
    placeholderData: (prev) => prev,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / limite)) : 1;

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
        <h1 style={{ margin: 0, color: '#0f172a' }}>Pacientes</h1>
        <Link
          to="/pacientes/novo"
          style={{
            padding: '10px 16px',
            background: '#0f766e',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + Novo paciente
        </Link>
      </div>

      <input
        placeholder="Buscar por nome, CPF ou telefone…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPagina(1);
        }}
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 10,
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          marginBottom: 16,
        }}
      />

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>
          Erro ao carregar pacientes: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          {data.itens.length === 0 ? (
            <div
              style={{
                background: '#fff',
                padding: 32,
                borderRadius: 8,
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              Nenhum paciente encontrado.
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
                    <Th>Nome</Th>
                    <Th>CPF</Th>
                    <Th>Nascimento</Th>
                    <Th>WhatsApp</Th>
                    <Th>{' '}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <Td>{p.nomeCompleto}</Td>
                      <Td>{formatCpf(p.cpf)}</Td>
                      <Td>
                        {new Date(p.dataNascimento).toLocaleDateString('pt-BR')}
                      </Td>
                      <Td>{formatTel(p.telefoneWhatsapp)}</Td>
                      <Td>
                        <Link
                          to={`/pacientes/${p.id}`}
                          style={{
                            color: '#0f766e',
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          Editar
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 16,
              alignItems: 'center',
              fontSize: 14,
              color: '#64748b',
            }}
          >
            <span>{data.total} paciente(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <PagButton
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </PagButton>
              <span style={{ padding: '6px 12px' }}>
                {pagina} / {totalPaginas}
              </span>
              <PagButton
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </PagButton>
            </div>
          </div>
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

function PagButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: '1px solid #cbd5e1',
        background: disabled ? '#f1f5f9' : '#fff',
        borderRadius: 6,
        color: disabled ? '#94a3b8' : '#0f172a',
      }}
    >
      {children}
    </button>
  );
}
