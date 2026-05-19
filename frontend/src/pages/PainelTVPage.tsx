import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obterPainelTV } from '../api/recepcao';
import type { AgendamentoListItem } from '../types/agenda';

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface ChamadoHistorico {
  id: string;
  paciente: string;
  profissional: string;
  hora: string; // HH:mm
  chamadoEm: number; // timestamp
}

const HIST_MAX = 5;

export default function PainelTVPage() {
  const data = isoDay(new Date());
  const [agora, setAgora] = useState(new Date());
  const [historico, setHistorico] = useState<ChamadoHistorico[]>([]);
  const [flash, setFlash] = useState(false);
  const ultimoIdRef = useRef<string | null>(null);

  // Atualiza relógio
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  const { data: painel, isLoading, isError, error } = useQuery({
    queryKey: ['painel-tv', data],
    queryFn: () => obterPainelTV(data),
    refetchInterval: 5_000,
  });

  const destaque = painel?.chamadoAgora;
  const proximos = painel?.proximos ?? [];

  // Detecta novo chamado e empilha no histórico
  useEffect(() => {
    if (!destaque) {
      ultimoIdRef.current = null;
      return;
    }
    if (ultimoIdRef.current === destaque.id) return;
    ultimoIdRef.current = destaque.id;
    setHistorico((prev) => {
      const novo: ChamadoHistorico = {
        id: destaque.id,
        paciente: destaque.paciente.nomeCompleto,
        profissional: destaque.profissional.nomeCompleto,
        hora: formatTime(destaque.dataHoraInicio),
        chamadoEm: Date.now(),
      };
      const sem = prev.filter((h) => h.id !== novo.id);
      return [novo, ...sem].slice(0, HIST_MAX);
    });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1_500);
    return () => clearTimeout(t);
  }, [destaque]);

  return (
    <div style={{ ...pageStyle, ...(flash ? flashOverlay : {}) }}>
      <div style={backdropStyle} />

      <header style={headerStyle}>
        <div>
          <div style={brandStyle}>Clínica Vida</div>
          <div style={subtitleStyle}>Painel de chamada</div>
        </div>
        <div style={relogioStyle}>
          <div style={relogioHora}>
            {agora.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div style={relogioData}>
            {agora.toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          </div>
        </div>
      </header>

      <main style={contentStyle}>
        <section style={heroStyle}>
          <div style={heroLabelStyle}>Chamando agora</div>
          {isLoading && <div style={emptyStateStyle}>Carregando painel...</div>}
          {isError && (
            <div style={emptyStateStyle}>
              Erro: {(error as Error).message}
            </div>
          )}
          {!isLoading && !isError && destaque ? (
            <>
              <div style={heroNameStyle}>{destaque.paciente.nomeCompleto}</div>
              <div style={heroMetaStyle}>
                {formatTime(destaque.dataHoraInicio)} ·{' '}
                {destaque.profissional.nomeCompleto}
              </div>
              <div style={heroPulseStyle}>Dirija-se ao consultório</div>
            </>
          ) : (
            !isLoading &&
            !isError && (
              <>
                <div style={{ ...heroNameStyle, color: '#94a3b8' }}>
                  Aguardando chamada
                </div>
                <div style={heroMetaStyle}>
                  Nenhum paciente sendo chamado neste momento
                </div>
              </>
            )
          )}
        </section>

        <aside style={sideStyle}>
          <Panel title="Próximos da fila">
            {proximos.length > 0 ? (
              proximos
                .slice(0, 5)
                .map((item) => <QueueCard key={item.id} item={item} />)
            ) : (
              <Empty>Sem pacientes aguardando.</Empty>
            )}
          </Panel>

          <Panel title="Últimos chamados">
            {historico.length > 0 ? (
              historico.map((h) => (
                <div key={h.id + h.chamadoEm} style={histCardStyle}>
                  <div style={{ fontWeight: 700, color: '#e2e8f0' }}>
                    {h.paciente}
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    {h.hora} · {h.profissional}
                  </div>
                </div>
              ))
            ) : (
              <Empty>Nenhum chamado anterior.</Empty>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={panelStyle}>
      <div style={panelTitleStyle}>{title}</div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function QueueCard({ item }: { item: AgendamentoListItem }) {
  return (
    <div style={queueCardStyle}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>
        {item.paciente.nomeCompleto}
      </div>
      <div style={queueMetaStyle}>
        {formatTime(item.dataHoraInicio)} · {item.profissional.nomeCompleto}
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
  transition: 'background 0.6s ease',
};

const flashOverlay: React.CSSProperties = {
  background:
    'radial-gradient(circle at top left, rgba(34, 197, 94, 0.55), transparent 34%), linear-gradient(135deg, #064e3b 0%, #0f172a 45%, #111827 100%)',
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
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: '#67e8f9',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#cbd5e1',
  marginTop: 6,
};

const relogioStyle: React.CSSProperties = {
  textAlign: 'right',
  padding: '14px 22px',
  borderRadius: 16,
  background: 'rgba(15, 23, 42, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
};

const relogioHora: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 800,
  color: '#67e8f9',
  letterSpacing: 1,
  lineHeight: 1,
};

const relogioData: React.CSSProperties = {
  fontSize: 13,
  color: '#cbd5e1',
  textTransform: 'capitalize',
  marginTop: 4,
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 0.6fr)',
  gap: 24,
  padding: '16px 40px 40px',
  alignItems: 'stretch',
};

const heroStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 160px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: 40,
  borderRadius: 28,
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.95))',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  boxShadow: '0 40px 120px rgba(2, 6, 23, 0.45)',
};

const heroLabelStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 3,
  textTransform: 'uppercase',
  color: '#67e8f9',
  marginBottom: 24,
};

const heroNameStyle: React.CSSProperties = {
  fontSize: 'clamp(56px, 9vw, 140px)',
  lineHeight: 0.95,
  fontWeight: 900,
  color: '#f8fafc',
  maxWidth: '100%',
  wordBreak: 'break-word',
};

const heroMetaStyle: React.CSSProperties = {
  marginTop: 24,
  fontSize: 'clamp(22px, 2.5vw, 36px)',
  color: '#cbd5e1',
};

const heroPulseStyle: React.CSSProperties = {
  marginTop: 32,
  display: 'inline-flex',
  alignSelf: 'flex-start',
  padding: '14px 22px',
  borderRadius: 999,
  background: 'rgba(6, 182, 212, 0.16)',
  border: '1px solid rgba(103, 232, 249, 0.4)',
  color: '#a5f3fc',
  fontWeight: 700,
  fontSize: 18,
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
  fontSize: 14,
  fontWeight: 800,
  color: '#e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
};

const queueCardStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid #22324b',
  marginBottom: 10,
  background: '#0b1120',
};

const queueMetaStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  color: '#94a3b8',
};

const histCardStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  background: 'rgba(15, 23, 42, 0.5)',
  marginBottom: 8,
  borderLeft: '3px solid #475569',
};

const emptyStateStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 14,
  padding: '12px 0',
};
