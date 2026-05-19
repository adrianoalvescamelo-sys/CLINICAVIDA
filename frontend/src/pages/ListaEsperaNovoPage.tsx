import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { criarListaEspera } from '../api/lista-espera';
import { listProfissionais } from '../api/profissionais';
import { listPacientes } from '../api/pacientes';
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

export default function ListaEsperaNovoPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhes, setErroDetalhes] = useState<unknown>(null);

  const [busca, setBusca] = useState('');
  const [pacienteId, setPacienteId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [prioridade, setPrioridade] = useState(0);
  const [observacoes, setObservacoes] = useState('');

  const { data: pacientes } = useQuery({
    queryKey: ['pacientes-busca', busca],
    queryFn: () =>
      listPacientes({
        q: busca || undefined,
        pagina: 1,
        limite: 20,
      }),
    enabled: busca.length >= 2,
  });

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', true],
    queryFn: () => listProfissionais({ ativos: true }),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErroDetalhes(null);

    if (!pacienteId) {
      setErro('Selecione um paciente');
      return;
    }

    setLoading(true);
    try {
      await criarListaEspera({
        pacienteId,
        profissionalId: profissionalId || undefined,
        especialidade: especialidade.trim() || undefined,
        prioridade,
        observacoes: observacoes.trim() || undefined,
      });
      navigate('/lista-espera');
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
          to="/lista-espera"
          style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}
        >
          ← Lista de espera
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 24, color: '#0f172a' }}>
        Adicionar paciente à lista de espera
      </h1>

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
          <label style={labelStyle}>Buscar paciente *</label>
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPacienteId('');
            }}
            placeholder="Digite nome, CPF ou telefone (mín 2 chars)"
            style={inputStyle}
          />
          {pacientes && pacientes.itens.length > 0 && (
            <div
              style={{
                marginTop: 8,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {pacientes.itens.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    setPacienteId(p.id);
                    setBusca(p.nomeCompleto);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 0,
                    background:
                      pacienteId === p.id ? '#ccfbf1' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {p.nomeCompleto} · {p.cpf} · {p.telefoneWhatsapp}
                </button>
              ))}
            </div>
          )}
          {pacienteId && (
            <small style={{ color: '#0f766e', fontWeight: 600 }}>
              ✓ Paciente selecionado
            </small>
          )}
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
            <label style={labelStyle}>Profissional (opcional)</label>
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Qualquer —</option>
              {profissionais?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeCompleto}{' '}
                  {p.especialidade ? `· ${p.especialidade}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Prioridade</label>
            <input
              type="number"
              min={0}
              max={999}
              value={prioridade}
              onChange={(e) => setPrioridade(Number(e.target.value))}
              style={inputStyle}
            />
            <small style={{ color: '#64748b' }}>
              0 = normal · maior = mais urgente
            </small>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Especialidade (opcional)</label>
          <input
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            maxLength={120}
            placeholder="Ex.: Cardiologia"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Observações</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            maxLength={1000}
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
          disabled={loading || !pacienteId}
          style={{
            padding: '10px 24px',
            background: loading || !pacienteId ? '#94a3b8' : '#0f766e',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {loading ? 'Salvando…' : 'Adicionar à lista'}
        </button>
      </form>
    </Layout>
  );
}
