import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listUsuarios } from '../api/usuarios';
import Layout from '../components/Layout';
import { PERFIS } from '../types/usuario';

function perfilLabel(p: string) {
  return PERFIS.find((x) => x.value === p)?.label ?? p;
}

export default function UsuariosListPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['usuarios'],
    queryFn: listUsuarios,
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
        <h1 style={{ margin: 0, color: '#0f172a' }}>Usuários</h1>
        <Link
          to="/usuarios/novo"
          style={{
            padding: '10px 16px',
            background: '#0f766e',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + Novo usuário
        </Link>
      </div>

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>
          Erro: {(error as Error).message}
        </p>
      )}

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
          Nenhum usuário cadastrado.
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
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Status</Th>
                <Th>Último login</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <Td>{u.nomeCompleto}</Td>
                  <Td>{u.email}</Td>
                  <Td>{perfilLabel(u.perfil)}</Td>
                  <Td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: u.ativo ? '#dcfce7' : '#fee2e2',
                        color: u.ativo ? '#166534' : '#991b1b',
                      }}
                    >
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </Td>
                  <Td>
                    {u.ultimoLoginEm
                      ? new Date(u.ultimoLoginEm).toLocaleString('pt-BR')
                      : '—'}
                  </Td>
                  <Td>
                    <Link
                      to={`/usuarios/${u.id}`}
                      style={{
                        color: '#0f766e',
                        textDecoration: 'none',
                        fontWeight: 500,
                        marginRight: 16,
                      }}
                    >
                      Editar
                    </Link>
                    <Link
                      to={`/usuarios/${u.id}/senha`}
                      style={{
                        color: '#b45309',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      Trocar senha
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p style={{ marginTop: 16, fontSize: 14, color: '#64748b' }}>
          {data.length} usuário(s)
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

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '12px 16px', fontSize: 14, color: '#0f172a' }}>
      {children}
    </td>
  );
}
