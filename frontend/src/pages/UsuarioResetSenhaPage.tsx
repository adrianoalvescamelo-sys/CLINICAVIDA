import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUsuario, resetSenhaUsuario } from '../api/usuarios';
import Layout from '../components/Layout';

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

export default function UsuarioResetSenhaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);
  const [ok, setOk] = useState(false);

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  const { data } = useQuery({
    queryKey: ['usuario', id],
    queryFn: () => getUsuario(id!),
    enabled: !!id,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);
    setOk(false);

    if (novaSenha !== confirmacao) {
      setErro('Senhas não conferem');
      return;
    }

    if (!id) return;
    setLoading(true);
    try {
      await resetSenhaUsuario(id, { novaSenha });
      setOk(true);
      setNovaSenha('');
      setConfirmacao('');
      setTimeout(() => navigate('/usuarios'), 1500);
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
        Trocar senha
      </h1>
      {data && (
        <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
          Usuário: <strong>{data.nomeCompleto}</strong> ({data.email})
        </p>
      )}

      <div
        style={{
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          color: '#78350f',
          fontSize: 13,
          maxWidth: 600,
        }}
      >
        Esta ação <strong>revoga todos os tokens ativos</strong> deste usuário.
        Ele será deslogado em todos os dispositivos.
      </div>

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
          <label style={labelStyle}>Nova senha *</label>
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            style={inputStyle}
          />
          <small style={{ color: '#64748b' }}>
            Mín 8 caracteres, incluindo maiúscula, minúscula e número.
          </small>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Confirmar nova senha *</label>
          <input
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            style={inputStyle}
          />
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

        {ok && (
          <div
            role="status"
            style={{
              background: '#dcfce7',
              color: '#166534',
              padding: 12,
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            Senha alterada. Redirecionando…
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: loading ? '#94a3b8' : '#b45309',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {loading ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </Layout>
  );
}
