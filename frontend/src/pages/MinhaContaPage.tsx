import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { trocarSenha } from '../api/auth';
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

export default function MinhaContaPage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);

    if (novaSenha !== confirmacao) {
      setErro('Nova senha e confirmação não conferem');
      return;
    }
    if (novaSenha === senhaAtual) {
      setErro('Nova senha não pode ser igual à atual');
      return;
    }

    setLoading(true);
    try {
      await trocarSenha({ senhaAtual, novaSenha });
      clear();
      alert('Senha alterada. Faça login novamente.');
      navigate('/login', { replace: true });
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
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>
        Minha conta
      </h1>
      {user && (
        <p style={{ marginTop: 0, color: '#64748b', fontSize: 14 }}>
          <strong>{user.nomeCompleto}</strong> · {user.email} · {user.perfil}
        </p>
      )}

      <h2 style={{ marginTop: 24, marginBottom: 16, color: '#0f172a', fontSize: 18 }}>
        Trocar senha
      </h2>

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
        Após trocar a senha, <strong>você será deslogado de todos os dispositivos</strong>.
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
          <label style={labelStyle}>Senha atual *</label>
          <input
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

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
          {loading ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </Layout>
  );
}
