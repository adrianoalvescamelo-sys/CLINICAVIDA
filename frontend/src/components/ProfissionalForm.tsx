import { FormEvent, useState } from 'react';
import type {
  ProfissionalFormData,
  ProfissionalUpdateData,
} from '../types/profissional';

interface Props {
  initial?: Partial<ProfissionalUpdateData>;
  loading?: boolean;
  submitLabel: string;
  showAtivo?: boolean;
  onSubmit: (data: ProfissionalUpdateData) => Promise<void>;
}

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

export default function ProfissionalForm({
  initial,
  loading,
  submitLabel,
  showAtivo,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ProfissionalUpdateData>({
    nomeCompleto: initial?.nomeCompleto ?? '',
    especialidade: initial?.especialidade ?? '',
    registroConselho: initial?.registroConselho ?? '',
    ehMedico: initial?.ehMedico ?? false,
    usuarioId: initial?.usuarioId ?? '',
    cor: initial?.cor ?? '#0f766e',
    ativo: initial?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  function set<K extends keyof ProfissionalUpdateData>(
    key: K,
    value: ProfissionalUpdateData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);

    const payload: ProfissionalUpdateData = {
      nomeCompleto: form.nomeCompleto.trim(),
      especialidade: form.especialidade?.trim() || undefined,
      registroConselho: form.registroConselho?.trim() || undefined,
      ehMedico: !!form.ehMedico,
      usuarioId: form.usuarioId?.trim() || undefined,
      cor: form.cor?.trim() || undefined,
    };
    if (showAtivo) payload.ativo = !!form.ativo;

    try {
      await onSubmit(payload);
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
    }
  }

  return (
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
        <label style={labelStyle}>Nome completo *</label>
        <input
          value={form.nomeCompleto}
          onChange={(e) => set('nomeCompleto', e.target.value)}
          required
          minLength={3}
          maxLength={120}
          style={inputStyle}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Especialidade</label>
          <input
            value={form.especialidade ?? ''}
            onChange={(e) => set('especialidade', e.target.value)}
            maxLength={120}
            placeholder="Ex.: Clínica Geral, Cardiologia"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Registro conselho</label>
          <input
            value={form.registroConselho ?? ''}
            onChange={(e) => set('registroConselho', e.target.value)}
            maxLength={40}
            placeholder="CRM-MT 12345"
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Cor agenda</label>
          <input
            type="color"
            value={form.cor ?? '#0f766e'}
            onChange={(e) => set('cor', e.target.value)}
            style={{ ...inputStyle, padding: 4, height: 42 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, paddingTop: 24 }}>
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
              checked={!!form.ehMedico}
              onChange={(e) => set('ehMedico', e.target.checked)}
            />
            É médico
          </label>
          {showAtivo && (
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
                checked={!!form.ativo}
                onChange={(e) => set('ativo', e.target.checked)}
              />
              Ativo
            </label>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>UUID usuário vinculado (opcional)</label>
        <input
          value={form.usuarioId ?? ''}
          onChange={(e) => set('usuarioId', e.target.value)}
          placeholder="UUID do usuário (login). Deixe vazio se não houver."
          style={inputStyle}
        />
        <small style={{ color: '#64748b' }}>
          Vincula esse profissional a um login. Cada usuário só pode estar
          ligado a um profissional.
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
        {loading ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}

export type { ProfissionalFormData };
