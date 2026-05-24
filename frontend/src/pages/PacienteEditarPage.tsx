import { Link, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PacienteDadosTab from '../components/PacienteDadosTab';
import ProntuarioTab from '../components/ProntuarioTab';
import DocumentosTab from '../components/DocumentosTab';
import { useAuthStore } from '../store/auth';

type Aba = 'dados' | 'prontuario' | 'documentos';

export default function PacienteEditarPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const perfil = useAuthStore((s) => s.user)?.perfil;
  const podeClinico = perfil !== 'RECEPCAO' && perfil !== undefined;

  const abaParam = (searchParams.get('aba') as Aba) ?? 'dados';
  const aba: Aba = !podeClinico && abaParam !== 'dados' ? 'dados' : abaParam;

  const abas: { key: Aba; label: string }[] = [
    { key: 'dados', label: 'Dados' },
    ...(podeClinico
      ? ([
          { key: 'prontuario', label: 'Prontuário' },
          { key: 'documentos', label: 'Documentos' },
        ] as { key: Aba; label: string }[])
      : []),
  ];

  if (!id) return null;

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link to="/pacientes" style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}>
          ← Pacientes
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>Paciente</h1>

      <div style={tabsStyle}>
        {abas.map((t) => (
          <button
            key={t.key}
            onClick={() => setSearchParams({ aba: t.key })}
            style={{ ...tabStyle, ...(aba === t.key ? activeTabStyle : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'dados' && <PacienteDadosTab pacienteId={id} />}
      {aba === 'prontuario' && podeClinico && <ProntuarioTab pacienteId={id} />}
      {aba === 'documentos' && podeClinico && <DocumentosTab pacienteId={id} />}
    </Layout>
  );
}

const tabsStyle: React.CSSProperties = {
  display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 2,
};
const tabStyle: React.CSSProperties = {
  padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
  fontSize: 14, color: '#64748b', borderRadius: '6px 6px 0 0',
};
const activeTabStyle: React.CSSProperties = {
  background: '#eff6ff', color: '#1d4ed8', fontWeight: 700,
};
