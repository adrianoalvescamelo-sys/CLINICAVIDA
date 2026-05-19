import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listarBloqueios,
  criarBloqueio,
  removerBloqueio,
  type NovoBloqueio,
} from '../api/agenda';
import { listProfissionais } from '../api/profissionais';
import Layout from '../components/Layout';
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

export default function BloqueiosPage() {
  const perfil = useAuthStore((s) => s.user?.perfil);
  const isMedicoOuProf =
    perfil === 'MEDICO' || perfil === 'PROFISSIONAL_NAO_MEDICO';
  const qc = useQueryClient();

  const [filtroProfissional, setFiltroProfissional] = useState('');
  const [form, setForm] = useState<NovoBloqueio>({
    profissionalId: '',
    dataHoraInicio: '',
    dataHoraFim: '',
    motivo: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', true],
    queryFn: () => listProfissionais({ ativos: true }),
  });

  const { data: bloqueios, isLoading } = useQuery({
    queryKey: ['bloqueios', filtroProfissional],
    queryFn: () => listarBloqueios(filtroProfissional || undefined),
  });

  const criar = useMutation({
    mutationFn: criarBloqueio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloqueios'] });
      setForm({
        profissionalId: '',
        dataHoraInicio: '',
        dataHoraFim: '',
        motivo: '',
      });
      setErro(null);
      setErroDetalhes(null);
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
        : (apiErr?.message ?? e?.message ?? 'Erro ao criar bloqueio');
      setErro(msg);
      setErroDetalhes(apiErr?.details ?? null);
    },
  });

  const remover = useMutation({
    mutationFn: removerBloqueio,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bloqueios'] }),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.profissionalId || !form.dataHoraInicio || !form.dataHoraFim) {
      setErro('Preencha profissional, início e fim');
      return;
    }
    if (new Date(form.dataHoraFim) <= new Date(form.dataHoraInicio)) {
      setErro('Fim deve ser depois do início');
      return;
    }
    criar.mutate({
      profissionalId: form.profissionalId,
      dataHoraInicio: new Date(form.dataHoraInicio).toISOString(),
      dataHoraFim: new Date(form.dataHoraFim).toISOString(),
      motivo: form.motivo?.trim() || undefined,
    });
  }

  function handleRemover(id: string) {
    if (!window.confirm('Remover este bloqueio?')) return;
    remover.mutate(id);
  }

  return (
    <Layout>
      <h1 style={{ marginTop: 0, marginBottom: 16, color: '#0f172a' }}>
        Bloqueios de agenda
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <section
          style={{
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 18, color: '#0f172a' }}>
            Novo bloqueio
          </h2>
          <p style={{ marginTop: 0, fontSize: 13, color: '#64748b' }}>
            {isMedicoOuProf
              ? 'Você só pode bloquear sua própria agenda.'
              : 'Você pode bloquear qualquer profissional (admin).'}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Profissional *</label>
              <select
                value={form.profissionalId}
                onChange={(e) =>
                  setForm({ ...form, profissionalId: e.target.value })
                }
                required
                style={inputStyle}
              >
                <option value="">Selecione…</option>
                {profissionais?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nomeCompleto}{' '}
                    {p.especialidade ? `· ${p.especialidade}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Início *</label>
              <input
                type="datetime-local"
                value={form.dataHoraInicio}
                onChange={(e) =>
                  setForm({ ...form, dataHoraInicio: e.target.value })
                }
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Fim *</label>
              <input
                type="datetime-local"
                value={form.dataHoraFim}
                onChange={(e) =>
                  setForm({ ...form, dataHoraFim: e.target.value })
                }
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Motivo</label>
              <input
                value={form.motivo ?? ''}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                maxLength={200}
                placeholder="Almoço, férias, reunião…"
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
                  fontSize: 13,
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
              disabled={criar.isPending}
              style={{
                padding: '10px 24px',
                background: criar.isPending ? '#94a3b8' : '#0f766e',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {criar.isPending ? 'Salvando…' : 'Criar bloqueio'}
            </button>
          </form>
        </section>

        <section>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              Bloqueios existentes
            </h2>
            <select
              value={filtroProfissional}
              onChange={(e) => setFiltroProfissional(e.target.value)}
              style={{
                padding: 8,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <option value="">Todos profissionais</option>
              {profissionais?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeCompleto}
                </option>
              ))}
            </select>
          </div>

          {isLoading && <p>Carregando…</p>}
          {bloqueios && bloqueios.length === 0 && (
            <div
              style={{
                background: '#fff',
                padding: 24,
                borderRadius: 8,
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              Nenhum bloqueio cadastrado.
            </div>
          )}

          {bloqueios && bloqueios.length > 0 && (
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              {bloqueios.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: 16,
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                      {b.profissional?.nomeCompleto ?? b.profissionalId}
                    </div>
                    <div
                      style={{ fontSize: 13, color: '#475569', marginTop: 4 }}
                    >
                      {new Date(b.dataHoraInicio).toLocaleString('pt-BR')} →{' '}
                      {new Date(b.dataHoraFim).toLocaleString('pt-BR')}
                    </div>
                    {b.motivo && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#64748b',
                          marginTop: 4,
                          fontStyle: 'italic',
                        }}
                      >
                        {b.motivo}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemover(b.id)}
                    disabled={remover.isPending}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #991b1b',
                      background: '#fff',
                      color: '#991b1b',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
