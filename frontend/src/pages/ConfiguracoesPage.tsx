import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { getConfiguracao, updateConfiguracao } from '../api/configuracoes';
import { DIAS_SEMANA, type ConfiguracaoUpdate } from '../types/configuracao';

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

export default function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ['configuracao'],
    queryFn: getConfiguracao,
  });

  const [form, setForm] = useState<ConfiguracaoUpdate>({});
  const [usaAlmoco, setUsaAlmoco] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (cfg) {
      setForm({
        nomeClinica: cfg.nomeClinica,
        horaAbertura: cfg.horaAbertura,
        horaFechamento: cfg.horaFechamento,
        diasFuncionamento: cfg.diasFuncionamento,
        duracaoConsultaMin: cfg.duracaoConsultaMin,
        intervaloAlmocoIni: cfg.intervaloAlmocoIni,
        intervaloAlmocoFim: cfg.intervaloAlmocoFim,
        timezone: cfg.timezone,
      });
      setUsaAlmoco(!!cfg.intervaloAlmocoIni && !!cfg.intervaloAlmocoFim);
    }
  }, [cfg]);

  const salvar = useMutation({
    mutationFn: updateConfiguracao,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracao'] });
      setOk(true);
      setErro(null);
      setErroDetalhes(null);
      setTimeout(() => setOk(false), 2000);
    },
    onError: (err) => {
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
    },
  });

  function toggleDia(d: number) {
    const dias = form.diasFuncionamento ?? [];
    if (dias.includes(d)) {
      setForm({
        ...form,
        diasFuncionamento: dias.filter((x) => x !== d).sort(),
      });
    } else {
      setForm({ ...form, diasFuncionamento: [...dias, d].sort() });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: ConfiguracaoUpdate = { ...form };
    if (!usaAlmoco) {
      payload.intervaloAlmocoIni = null;
      payload.intervaloAlmocoFim = null;
    }
    salvar.mutate(payload);
  }

  if (isLoading) {
    return (
      <Layout>
        <p>Carregando…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={{ marginTop: 0, marginBottom: 16, color: '#0f172a' }}>
        Configurações da clínica
      </h1>
      {cfg && (
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
          Última atualização: {new Date(cfg.updatedAt).toLocaleString('pt-BR')}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          maxWidth: 720,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nome da clínica *</label>
          <input
            value={form.nomeClinica ?? ''}
            onChange={(e) => setForm({ ...form, nomeClinica: e.target.value })}
            required
            minLength={2}
            maxLength={120}
            style={inputStyle}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Hora abertura *</label>
            <input
              type="time"
              value={form.horaAbertura ?? ''}
              onChange={(e) =>
                setForm({ ...form, horaAbertura: e.target.value })
              }
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Hora fechamento *</label>
            <input
              type="time"
              value={form.horaFechamento ?? ''}
              onChange={(e) =>
                setForm({ ...form, horaFechamento: e.target.value })
              }
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Duração consulta (min)</label>
            <input
              type="number"
              min={5}
              max={240}
              value={form.duracaoConsultaMin ?? 30}
              onChange={(e) =>
                setForm({
                  ...form,
                  duracaoConsultaMin: Number(e.target.value),
                })
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Dias de funcionamento</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DIAS_SEMANA.map((d) => {
              const ativo = form.diasFuncionamento?.includes(d.value);
              return (
                <button
                  type="button"
                  key={d.value}
                  onClick={() => toggleDia(d.value)}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${ativo ? '#0f766e' : '#cbd5e1'}`,
                    background: ativo ? '#0f766e' : '#fff',
                    color: ativo ? '#fff' : '#475569',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <fieldset
          style={{
            border: '1px solid #e2e8f0',
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <legend style={{ fontSize: 13, color: '#64748b', padding: '0 8px' }}>
            Horário de almoço
          </legend>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: '#334155',
              marginBottom: 12,
            }}
          >
            <input
              type="checkbox"
              checked={usaAlmoco}
              onChange={(e) => setUsaAlmoco(e.target.checked)}
            />
            Marcar intervalo de almoço como indisponível
          </label>
          {usaAlmoco && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Início</label>
                <input
                  type="time"
                  value={form.intervaloAlmocoIni ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      intervaloAlmocoIni: e.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Fim</label>
                <input
                  type="time"
                  value={form.intervaloAlmocoFim ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      intervaloAlmocoFim: e.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </fieldset>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Timezone</label>
          <input
            value={form.timezone ?? ''}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            maxLength={60}
            placeholder="America/Cuiaba"
            style={inputStyle}
          />
          <small style={{ color: '#64748b' }}>
            Identificador IANA (ex.: America/Cuiaba, America/Sao_Paulo)
          </small>
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
            ✓ Configurações salvas
          </div>
        )}

        <button
          type="submit"
          disabled={salvar.isPending}
          style={{
            padding: '10px 24px',
            background: salvar.isPending ? '#94a3b8' : '#0f766e',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>
    </Layout>
  );
}
