import { useState } from 'react';
import type { Profissional } from '../types/agenda';
import type { CriarListaEsperaPayload } from '../types/lista-espera';
import type { PacienteListItem } from '../types/paciente';

export default function ListaEsperaForm({
  pacientes,
  profissionais,
  onSubmit,
  disabled,
}: {
  pacientes: PacienteListItem[];
  profissionais: Profissional[];
  onSubmit: (payload: CriarListaEsperaPayload) => Promise<void>;
  disabled?: boolean;
}) {
  const [pacienteId, setPacienteId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [prioridade, setPrioridade] = useState(50);
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!pacienteId) {
      setErro('Selecione um paciente.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        pacienteId,
        profissionalId: profissionalId || undefined,
        especialidade: especialidade || undefined,
        prioridade,
        observacoes: observacoes || undefined,
      });
      setPacienteId('');
      setProfissionalId('');
      setEspecialidade('');
      setPrioridade(50);
      setObservacoes('');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <select
        value={pacienteId}
        onChange={(e) => setPacienteId(e.target.value)}
        style={inputStyle}
        disabled={disabled || submitting}
      >
        <option value="">Paciente</option>
        {pacientes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nomeCompleto}
          </option>
        ))}
      </select>

      <select
        value={profissionalId}
        onChange={(e) => setProfissionalId(e.target.value)}
        style={inputStyle}
        disabled={disabled || submitting}
      >
        <option value="">Profissional opcional</option>
        {profissionais.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nomeCompleto}
          </option>
        ))}
      </select>

      <input
        value={especialidade}
        onChange={(e) => setEspecialidade(e.target.value)}
        placeholder="Especialidade"
        style={inputStyle}
        disabled={disabled || submitting}
      />

      <input
        type="number"
        min={0}
        max={999}
        value={prioridade}
        onChange={(e) => setPrioridade(Number(e.target.value))}
        style={{ ...inputStyle, width: 110 }}
        disabled={disabled || submitting}
      />

      <input
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value)}
        placeholder="Observacoes"
        style={inputStyle}
        disabled={disabled || submitting}
      />

      <button disabled={disabled || submitting} style={buttonStyle}>
        Adicionar
      </button>

      {erro && <span style={{ color: '#991b1b', fontSize: 12 }}>{erro}</span>}
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: 12,
  borderBottom: '1px solid #e2e8f0',
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  minWidth: 160,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #0f766e',
  background: '#0f766e',
  color: '#fff',
  borderRadius: 6,
  fontWeight: 700,
};
