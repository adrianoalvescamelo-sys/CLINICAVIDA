import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUsuario, updateUsuario } from '../api/usuarios';
import Layout from '../components/Layout';
import { PERFIS, type Perfil } from '../types/usuario';
import { useAuthStore } from '../store/auth';

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

export default function UsuarioEditarPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meId = useAuthStore((s) => s.user?.id);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['usuario', id],
    queryFn: () => getUsuario(id!),
    enabled: !!id,
  });

  const [form, setForm] = useState({
    nomeCompleto: '',
    perfil: 'RECEPCAO' as Perfil,
    ativo: true,
  });

  useEffect(() => {
    if (data) {
      setForm({
        nomeCompleto: data.nomeCompleto,
        perfil: data.perfil,
        ativo: data.ativo,
      });
    }
  }, [data]);

  const isSelf = data?.id === meId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setErro(null);
    setErroDetalhes(null);
    setLoading(true);
    try {
      await updateUsuario(data.id, {
        nomeCompleto: form.nomeCompleto.trim(),
        perfil: form.perfil,
        ativo: form.ativo,
      });
      await refetch();
      navigate('/usuarios');
    } catch (err) {
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/usuarios"
          style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}
        >
          ← Usuários
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>
        Editar usuário
      </h1>

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>
      )}

      {data && (
        <>
          <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
            {data.email} · Última atualização:{' '}
            {new Date(data.updatedAt).toLocaleString('pt-BR')}
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              maxWidth: 600,
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nome completo *</label>
              <input
                value={form.nomeCompleto}
                onChange={(e) =>
                  setForm({ ...form, nomeCompleto: e.target.value })
                }
                required
                minLength={3}
                maxLength={120}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Perfil *</label>
              <select
                value={form.perfil}
                onChange={(e) =>
                  setForm({ ...form, perfil: e.target.value as Perfil })
                }
                disabled={isSelf}
                style={inputStyle}
              >
                {PERFIS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {isSelf && (
                <small style={{ color: '#64748b' }}>
                  Não é possível alterar o próprio perfil.
                </small>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: '#334155',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) =>
                    setForm({ ...form, ativo: e.target.checked })
                  }
                  disabled={isSelf}
                />
                Ativo
              </label>
              {isSelf && (
                <small style={{ color: '#64748b' }}>
                  Não é possível desativar a própria conta.
                </small>
              )}
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

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '10px 24px',
                  background: loading ? '#94a3b8' : '#0f766e',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {loading ? 'Salvando…' : 'Salvar alterações'}
              </button>
              <Link
                to={`/usuarios/${data.id}/senha`}
                style={{
                  padding: '10px 24px',
                  background: '#fff',
                  color: '#b45309',
                  border: '1px solid #f59e0b',
                  borderRadius: 6,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Trocar senha
              </Link>
            </div>
          </form>
        </>
      )}
    </Layout>
  );
}
