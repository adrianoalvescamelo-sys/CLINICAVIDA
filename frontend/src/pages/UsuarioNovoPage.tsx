import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUsuario } from '../api/usuarios';
import Layout from '../components/Layout';
import { PERFIS, type Perfil } from '../types/usuario';

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

export default function UsuarioNovoPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  const [form, setForm] = useState({
    email: '',
    senha: '',
    nomeCompleto: '',
    perfil: 'RECEPCAO' as Perfil,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);
    setLoading(true);
    try {
      const u = await createUsuario({
        email: form.email.trim().toLowerCase(),
        senha: form.senha,
        nomeCompleto: form.nomeCompleto.trim(),
        perfil: form.perfil,
      });
      navigate(`/usuarios/${u.id}`, { replace: true });
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
      <h1 style={{ marginTop: 0, marginBottom: 24, color: '#0f172a' }}>
        Novo usuário
      </h1>

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
          <label style={labelStyle}>E-mail *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            maxLength={255}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Senha *</label>
          <input
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
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
          <label style={labelStyle}>Perfil *</label>
          <select
            value={form.perfil}
            onChange={(e) =>
              setForm({ ...form, perfil: e.target.value as Perfil })
            }
            style={inputStyle}
          >
            {PERFIS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
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
          {loading ? 'Salvando…' : 'Cadastrar usuário'}
        </button>
      </form>
    </Layout>
  );
}
