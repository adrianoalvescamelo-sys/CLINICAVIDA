import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/auth';

export default function HomePage() {
  const perfil = useAuthStore((s) => s.user?.perfil);
  const isAdmin = perfil === 'ADMIN';
  const isRecepcao = perfil === 'ADMIN' || perfil === 'RECEPCAO';
  const podeBloquear =
    perfil === 'ADMIN' ||
    perfil === 'MEDICO' ||
    perfil === 'PROFISSIONAL_NAO_MEDICO';
  return (
    <Layout>
      <h1 style={{ color: '#0f172a', marginTop: 0 }}>Painel</h1>
      <p style={{ color: '#475569' }}>Selecione um módulo:</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        <ModuleCard
          to="/pacientes"
          title="Pacientes"
          subtitle="Cadastro e busca"
          enabled
        />
        <ModuleCard
          to="/profissionais"
          title="Profissionais"
          subtitle="Médicos e equipe"
          enabled
        />
        <ModuleCard
          to="/agenda"
          title="Agenda"
          subtitle="Agendamentos do dia"
          enabled
        />
        {podeBloquear && (
          <ModuleCard
            to="/bloqueios"
            title="Bloqueios"
            subtitle="Indisponibilidade"
            enabled
          />
        )}
        <ModuleCard
          to="/whatsapp"
          title="WhatsApp"
          subtitle="Pendências e envios"
          enabled
        />
        <ModuleCard
          to="/recepcao"
          title="Recepcao"
          subtitle="Operacao do dia"
          enabled
        />
        {isRecepcao && (
          <ModuleCard
            to="/lista-espera"
            title="Lista de espera"
            subtitle="Fila priorizada"
            enabled
          />
        )}
        <ModuleCard
          to="/painel-tv"
          title="Painel TV"
          subtitle="Chamada do paciente"
          enabled
        />
        <ModuleCard to="/relatorios" title="Relatórios" subtitle="Operacionais" enabled />
        {isAdmin && (
          <ModuleCard
            to="/usuarios"
            title="Usuários"
            subtitle="Gerenciar logins"
            enabled
          />
        )}
      </div>
    </Layout>
  );
}

function ModuleCard({
  to,
  title,
  subtitle,
  enabled,
}: {
  to: string;
  title: string;
  subtitle: string;
  enabled?: boolean;
}) {
  const content = (
    <div
      style={{
        background: '#fff',
        padding: 20,
        borderRadius: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: '#0f172a',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#64748b' }}>{subtitle}</div>
    </div>
  );
  return enabled ? (
    <Link to={to} style={{ textDecoration: 'none' }}>
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}
