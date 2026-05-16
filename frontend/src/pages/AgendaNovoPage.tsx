import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { criarAgendamento, listProfissionais } from '../api/agenda';
import { listPacientes } from '../api/pacientes';
import type { TipoAtendimento } from '../types/agenda';

export default function AgendaNovoPage() {
  const navigate = useNavigate();
  const [pacienteQ, setPacienteQ] = useState('');
  const [pacienteId, setPacienteId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [data, setData] = useState('');
  const [horaIni, setHoraIni] = useState('09:00');
  const [duracao, setDuracao] = useState(30);
  const [tipo, setTipo] = useState<TipoAtendimento>('CONSULTA');
  const [encaixe, setEncaixe] = useState(false);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => listProfissionais(true),
  });

  const { data: pacientes } = useQuery({
    queryKey: ['busca-pacientes', pacienteQ],
    queryFn: () => listPacientes({ q: pacienteQ, limite: 10 }),
    enabled: pacienteQ.length >= 2,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const inicio = new Date(`${data}T${horaIni}:00`);
      const fim = new Date(inicio.getTime() + duracao * 60_000);
      await criarAgendamento({
        pacienteId,
        profissionalId,
        dataHoraInicio: inicio.toISOString(),
        dataHoraFim: fim.toISOString(),
        tipo,
        encaixe,
        observacoes: obs || undefined,
      });
      navigate('/agenda');
    } catch (err) {
      const apiErr = (err as {
        response?: { data?: { error?: { message?: string | string[] } } };
      })?.response?.data?.error;
      setErro(
        Array.isArray(apiErr?.message)
          ? apiErr.message.join(', ')
          : apiErr?.message ?? 'Erro ao agendar',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/agenda"
          style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}
        >
          ← Agenda
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 24, color: '#0f172a' }}>
        Novo agendamento
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 24,
          borderRadius: 12,
          maxWidth: 600,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Paciente *</label>
          <input
            placeholder="Buscar paciente..."
            value={pacienteQ}
            onChange={(e) => {
              setPacienteQ(e.target.value);
              setPacienteId('');
            }}
            style={inputStyle}
          />
          {pacientes && pacientes.itens.length > 0 && !pacienteId && (
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderTop: 0,
                background: '#fff',
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {pacientes.itens.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setPacienteId(p.id);
                    setPacienteQ(p.nomeCompleto);
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  {p.nomeCompleto}
                  <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                    {p.cpf}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pacienteId && (
            <p style={{ fontSize: 13, color: '#0f766e', marginTop: 4 }}>
              ✓ paciente selecionado
            </p>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Profissional *</label>
          <select
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Selecione…</option>
            {profissionais?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomeCompleto}
                {p.especialidade ? ` · ${p.especialidade}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Data *</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Hora *</label>
            <input
              type="time"
              value={horaIni}
              onChange={(e) => setHoraIni(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Duração (min)</label>
            <input
              type="number"
              min={5}
              max={240}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAtendimento)}
            style={inputStyle}
          >
            <option value="CONSULTA">Consulta</option>
            <option value="RETORNO">Retorno</option>
            <option value="EXAME">Exame</option>
            <option value="PROCEDIMENTO">Procedimento</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
          >
            <input
              type="checkbox"
              checked={encaixe}
              onChange={(e) => setEncaixe(e.target.checked)}
            />
            Encaixe (força agendamento em horário ocupado)
          </label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Observações</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {erro && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: 12,
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !pacienteId || !profissionalId}
          style={{
            padding: '10px 24px',
            background:
              loading || !pacienteId || !profissionalId ? '#94a3b8' : '#0f766e',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {loading ? 'Agendando…' : 'Criar agendamento'}
        </button>
      </form>
    </Layout>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 10,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};
