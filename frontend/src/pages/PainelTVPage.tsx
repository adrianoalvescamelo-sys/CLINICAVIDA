import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { obterPainelTV } from '../api/recepcao';
import type { AgendamentoListItem } from '../types/agenda';

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function PainelTVPage() {
  const data = isoDay(new Date());

  const { data: painel, isLoading, isError, error } = useQuery({
    queryKey: ['painel-tv', data],
    queryFn: () => obterPainelTV(data),
    refetchInterval: 5_000,
  });

  const destaque = painel?.chamadoAgora;
  const proximos = painel?.proximos ?? [];

  return (
    <div style={pageStyle}>
      <div style={backdropStyle} />
      <header style={headerStyle}>
        <div>
          <div style={brandStyle}>Clínica Vida</div>
          <div style={subtitleStyle}>Painel de chamada</div>
        </div>
        <div style={metaStyle}>
          Atualização automática a cada 5s
          <span style={{ marginLeft: 12, opacity: 0.8 }}>
            {new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </header>

      <main style={contentStyle}>
        <section style={heroStyle}>
          <div style={heroLabelStyle}>Chamando agora</div>
          {isLoading && <div style={emptyStateStyle}>Carregando painel...</div>}
          {isError && (
            <div style={emptyStateStyle}>
              Erro ao carregar painel: {(error as Error).message}
            </div>
          )}
          {!isLoading && !isError && destaque ? (
            <>
              <div style={heroNameStyle}>{destaque.paciente.nomeCompleto}</div>
              <div style={heroMetaStyle}>
                {formatTime(destaque.dataHoraInicio)} -{' '}
                {destaque.profissional.nomeCompleto}
              </div>
              <div style={heroPulseStyle}>Dirija-se ao consultório</div>
            </>
          ) : (
            !isLoading &&
            !isError && (
              <>
                <div style={heroNameStyle}>Aguardando chamada</div>
                <div style={heroMetaStyle}>
                  Nenhum paciente está em atendimento neste momento
                </div>
              </>
            )
          )}
        </section>

        <aside style={sideStyle}>
          <Panel title="Em atendimento">
            {destaque ? (
              <QueueCard item={destaque} highlight />
            ) : (
              <Empty>Sem paciente em atendimento.</Empty>
            )}
          </Panel>

          <Panel title="Fila de espera">
            {proximos.length > 0 ? (
              proximos.map((item) => (
                <QueueCard key={item.id} item={item} />
              ))
            ) : (
              <Empty>Sem pacientes aguardando.</Empty>
            )}
          </Panel>

          <Panel title="Atalho operacional">
            <Link to="/agenda" style={linkStyle}>
              Abrir agenda do dia
            </Link>
            <Link to="/recepcao" style={secondaryLinkStyle}>
              Ver recepção
            </Link>
          </Panel>
        </aside>
      </main>
    </div>
  );
}


function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelTitleStyle}>{title}</div>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function QueueCard({
  item,
  highlight,
}: {
  item: AgendamentoListItem;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        ...queueCardStyle,
        borderColor: highlight ? '#67e8f9' : '#22324b',
        background: highlight ? 'rgba(6, 182, 212, 0.14)' : '#0b1120',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
        {item.paciente.nomeCompleto}
      </div>
      <div style={queueMetaStyle}>
        {formatTime(item.dataHoraInicio)} - {item.profissional.nomeCompleto}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={emptyStateStyle}>{children}</div>;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  overflow: 'hidden',
  color: '#f8fafc',
  background:
    'radial-gradient(circle at top left, rgba(20, 184, 166, 0.28), transparent 34%), linear-gradient(135deg, #020617 0%, #0f172a 45%, #111827 100%)',
};

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(120deg, rgba(14, 165, 233, 0.12), transparent 45%, rgba(16, 185, 129, 0.12))',
  pointerEvents: 'none',
};

const headerStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '28px 40px 12px',
};

const brandStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: '#67e8f9',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#cbd5e1',
  marginTop: 6,
};

const metaStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#cbd5e1',
  padding: '10px 14px',
  borderRadius: 999,
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 0.7fr)',
  gap: 24,
  padding: '16px 40px 40px',
  alignItems: 'stretch',
};

const heroStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 140px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: 36,
  borderRadius: 28,
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.95))',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  boxShadow: '0 40px 120px rgba(2, 6, 23, 0.45)',
};

const heroLabelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#67e8f9',
  marginBottom: 18,
};

const heroNameStyle: React.CSSProperties = {
  fontSize: 'clamp(40px, 6vw, 92px)',
  lineHeight: 0.95,
  fontWeight: 800,
  color: '#f8fafc',
  maxWidth: 900,
};

const heroMetaStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: 'clamp(18px, 2vw, 28px)',
  color: '#cbd5e1',
};

const heroPulseStyle: React.CSSProperties = {
  marginTop: 28,
  display: 'inline-flex',
  alignSelf: 'flex-start',
  padding: '12px 18px',
  borderRadius: 999,
  background: 'rgba(6, 182, 212, 0.16)',
  border: '1px solid rgba(103, 232, 249, 0.4)',
  color: '#a5f3fc',
  fontWeight: 700,
  letterSpacing: 0.3,
};

const sideStyle: React.CSSProperties = {
  display: 'grid',
  gap: 18,
  alignContent: 'start',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.78)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 24,
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(2, 6, 23, 0.35)',
};

const panelTitleStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  fontSize: 13,
  fontWeight: 800,
  color: '#e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const queueCardStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderRadius: 18,
  border: '1px solid',
  marginBottom: 12,
  background: '#0b1120',
};

const queueMetaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: '#94a3b8',
};

const emptyStateStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 14,
  padding: '12px 0',
};

const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '14px 16px',
  borderRadius: 16,
  background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  textAlign: 'center',
  marginBottom: 10,
};

const secondaryLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '14px 16px',
  borderRadius: 16,
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  textDecoration: 'none',
  fontWeight: 700,
  textAlign: 'center',
  border: '1px solid rgba(148, 163, 184, 0.18)',
};
