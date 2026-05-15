import { FormEvent, useState } from 'react';
import type { PacienteFormData, Sexo } from '../types/paciente';

interface Props {
  initial?: Partial<PacienteFormData>;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (data: PacienteFormData) => Promise<void>;
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

function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

export default function PacienteForm({
  initial,
  loading,
  submitLabel,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PacienteFormData>({
    nomeCompleto: initial?.nomeCompleto ?? '',
    cpf: maskCpf(initial?.cpf ?? ''),
    dataNascimento: initial?.dataNascimento?.slice(0, 10) ?? '',
    sexo: initial?.sexo ?? 'NAO_INFORMADO',
    telefoneWhatsapp: maskTel(initial?.telefoneWhatsapp ?? ''),
    telefoneSecundario: maskTel(initial?.telefoneSecundario ?? ''),
    email: initial?.email ?? '',
    responsavelNome: initial?.responsavelNome ?? '',
    responsavelCpf: maskCpf(initial?.responsavelCpf ?? ''),
    observacoes: initial?.observacoes ?? '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  function set<K extends keyof PacienteFormData>(
    key: K,
    value: PacienteFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);
    try {
      await onSubmit({
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        dataNascimento: form.dataNascimento,
        sexo: form.sexo,
        telefoneWhatsapp: form.telefoneWhatsapp.replace(/\D/g, ''),
        telefoneSecundario: form.telefoneSecundario?.replace(/\D/g, '') || undefined,
        email: form.email?.trim() || undefined,
        responsavelNome: form.responsavelNome?.trim() || undefined,
        responsavelCpf:
          form.responsavelCpf?.replace(/\D/g, '') || undefined,
        observacoes: form.observacoes?.trim() || undefined,
      });
    } catch (err: any) {
      const apiErr = err?.response?.data?.error;
      const msg =
        Array.isArray(apiErr?.message)
          ? apiErr.message.join(', ')
          : apiErr?.message ?? err?.message ?? 'Erro ao salvar';
      setErro(msg);
      setErroDetalhes(apiErr?.details ?? null);
    }
  }

  const sexos: { value: Sexo; label: string }[] = [
    { value: 'NAO_INFORMADO', label: 'Não informado' },
    { value: 'FEMININO', label: 'Feminino' },
    { value: 'MASCULINO', label: 'Masculino' },
    { value: 'OUTRO', label: 'Outro' },
  ];

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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Nome completo *</label>
          <input
            value={form.nomeCompleto}
            onChange={(e) => set('nomeCompleto', e.target.value)}
            required
            maxLength={120}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>CPF *</label>
          <input
            value={form.cpf}
            onChange={(e) => set('cpf', maskCpf(e.target.value))}
            required
            placeholder="000.000.000-00"
            style={inputStyle}
          />
        </div>
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
          <label style={labelStyle}>Data de nascimento *</label>
          <input
            type="date"
            value={form.dataNascimento}
            onChange={(e) => set('dataNascimento', e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Sexo</label>
          <select
            value={form.sexo}
            onChange={(e) => set('sexo', e.target.value as Sexo)}
            style={inputStyle}
          >
            {sexos.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>E-mail</label>
          <input
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
            maxLength={255}
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
          <label style={labelStyle}>WhatsApp *</label>
          <input
            value={form.telefoneWhatsapp}
            onChange={(e) =>
              set('telefoneWhatsapp', maskTel(e.target.value))
            }
            required
            placeholder="(66) 99999-9999"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Telefone secundário</label>
          <input
            value={form.telefoneSecundario ?? ''}
            onChange={(e) =>
              set('telefoneSecundario', maskTel(e.target.value))
            }
            placeholder="(66) 3000-0000"
            style={inputStyle}
          />
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
          Responsável (menor de idade)
        </legend>
        <div
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}
        >
          <div>
            <label style={labelStyle}>Nome do responsável</label>
            <input
              value={form.responsavelNome ?? ''}
              onChange={(e) => set('responsavelNome', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>CPF do responsável</label>
            <input
              value={form.responsavelCpf ?? ''}
              onChange={(e) => set('responsavelCpf', maskCpf(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>
      </fieldset>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Observações</label>
        <textarea
          value={form.observacoes ?? ''}
          onChange={(e) => set('observacoes', e.target.value)}
          rows={3}
          maxLength={2000}
          style={{ ...inputStyle, resize: 'vertical' }}
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
        {loading ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}
