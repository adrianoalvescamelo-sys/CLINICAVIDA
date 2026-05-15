import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';
import {
  getAgendaDia,
  getAgendamentosStatus,
  getPacientesPeriodo,
  getOrigemAgendamentos,
  exportXlsx,
  exportPdf,
  type RelatorioFiltros,
  type AgendaItem,
  type OrigemEntry,
} from '../api/relatorios';
import { listProfissionais } from '../api/agenda';
import { useAuthStore } from '../store/auth';

type TipoRelatorio = 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem';

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDatetimePtBR(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Cuiaba',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function RelatoriosPage() {
  const [tipo, setTipo] = useState<TipoRelatorio>('agenda-dia');
  const [agendaData, setAgendaData] = useState(isoToday());
  const [inicio, setInicio] = useState(isoNDaysAgo(7));
  const [fim, setFim] = useState(isoToday());
  const [profissionalId, setProfissionalId] = useState('');

  const token = useAuthStore((s) => s.token) ?? '';
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.perfil === 'ADMIN';
  const isMedico =
    user?.perfil === 'MEDICO' || user?.perfil === 'PROFISSIONAL_NAO_MEDICO';

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais'],
    queryFn: () => listProfissionais(true),
  });

  const filtros: RelatorioFiltros = {
    inicio: inicio || undefined,
    fim: fim || undefined,
    profissionalId: profissionalId || undefined,
  };

  const agendaDiaQuery = useQuery({
    queryKey: ['relatorio-agenda-dia', agendaData, profissionalId],
    queryFn: () => getAgendaDia({ data: agendaData, profissionalId: profissionalId || undefined }),
    enabled: tipo === 'agenda-dia',
  });

  const statusQuery = useQuery({
    queryKey: ['relatorio-status', filtros],
    queryFn: () => getAgendamentosStatus(filtros),
    enabled: tipo === 'agendamentos-status',
  });

  const pacientesQuery = useQuery({
    queryKey: ['relatorio-pacientes', filtros],
    queryFn: () => getPacientesPeriodo(filtros),
    enabled: tipo === 'pacientes' && !isMedico,
  });

  const origemQuery = useQuery({
    queryKey: ['relatorio-origem', filtros],
    queryFn: () => getOrigemAgendamentos(filtros),
    enabled: tipo === 'origem',
  });

  function handleExportXlsx() {
    const params =
      tipo === 'agenda-dia'
        ? { data: agendaData, profissionalId: profissionalId || undefined }
        : { ...filtros };
    exportXlsx(tipo, params, token);
  }

  function handleExportPdf() {
    const params =
      tipo === 'agenda-dia'
        ? { data: agendaData, profissionalId: profissionalId || undefined }
        : { ...filtros };
    exportPdf(tipo, params, token);
  }

  return (
    <Layout>
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#0f172a', margin: 0 }}>Relatorios</h1>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Relatorios operacionais — sem dados clinicos
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExportXlsx} style={buttonStyle}>
              Exportar XLSX
            </button>
            <button onClick={handleExportPdf} style={buttonStyle}>
              Exportar PDF
            </button>
          </div>
        )}
      </div>

      {/* Seletor de tipo */}
      <div style={tabsStyle}>
        {(
          [
            { key: 'agenda-dia', label: 'Agenda do dia' },
            { key: 'agendamentos-status', label: 'Por status' },
            { key: 'pacientes', label: 'Pacientes cadastrados', onlyAdminRecepcao: true },
            { key: 'origem', label: 'Origem' },
          ] as { key: TipoRelatorio; label: string; onlyAdminRecepcao?: boolean }[]
        )
          .filter((t) => !(t.onlyAdminRecepcao && isMedico))
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTipo(t.key)}
              style={{ ...tabStyle, ...(tipo === t.key ? activeTabStyle : {}) }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* Filtros */}
      <div style={filtersStyle}>
        {tipo === 'agenda-dia' ? (
          <input
            type="date"
            value={agendaData}
            onChange={(e) => setAgendaData(e.target.value)}
            style={inputStyle}
          />
        ) : (
          <>
            <label style={labelStyle}>
              De
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Ate
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                style={inputStyle}
              />
            </label>
          </>
        )}

        {!isMedico && (
          <select
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
            style={{ ...inputStyle, minWidth: 220 }}
          >
            <option value="">Todos profissionais</option>
            {profissionais?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomeCompleto}
                {p.especialidade ? ` - ${p.especialidade}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Conteudo */}
      <div style={contentStyle}>
        {tipo === 'agenda-dia' && (
          <RelatorioSection
            isLoading={agendaDiaQuery.isLoading}
            error={agendaDiaQuery.error as Error | null}
            generatedAt={agendaDiaQuery.data?.generatedAt}
            total={agendaDiaQuery.data?.total}
          >
            <AgendaDiaTable items={agendaDiaQuery.data?.agendamentos ?? []} />
          </RelatorioSection>
        )}

        {tipo === 'agendamentos-status' && (
          <RelatorioSection
            isLoading={statusQuery.isLoading}
            error={statusQuery.error as Error | null}
            generatedAt={statusQuery.data?.generatedAt}
            total={statusQuery.data?.total}
          >
            {statusQuery.data && Object.keys(statusQuery.data.porStatus).length === 0 && (
              <Empty>Nenhum agendamento no periodo.</Empty>
            )}
            {statusQuery.data &&
              Object.entries(statusQuery.data.porStatus).map(([status, info]) => (
                <div key={status} style={{ marginBottom: 20 }}>
                  <div style={sectionTitleStyle}>
                    {status.replace(/_/g, ' ')} — {info.count}
                  </div>
                  <AgendaDiaTable items={info.agendamentos} />
                </div>
              ))}
          </RelatorioSection>
        )}

        {tipo === 'pacientes' && !isMedico && (
          <RelatorioSection
            isLoading={pacientesQuery.isLoading}
            error={pacientesQuery.error as Error | null}
            generatedAt={pacientesQuery.data?.generatedAt}
            total={pacientesQuery.data?.total}
          >
            {(pacientesQuery.data?.pacientes ?? []).length === 0 && (
              <Empty>Nenhum paciente cadastrado no periodo.</Empty>
            )}
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <Th>Nome</Th>
                  <Th>CPF</Th>
                  <Th>Nascimento</Th>
                  <Th>Sexo</Th>
                  <Th>Telefone</Th>
                  <Th>Cadastrado em</Th>
                </tr>
              </thead>
              <tbody>
                {pacientesQuery.data?.pacientes.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <Td>{p.nomeCompleto}</Td>
                    <Td>{p.cpf}</Td>
                    <Td>{new Date(p.dataNascimento).toLocaleDateString('pt-BR')}</Td>
                    <Td>{p.sexo.replace(/_/g, ' ')}</Td>
                    <Td>{p.telefoneWhatsapp}</Td>
                    <Td>{formatDatetimePtBR(p.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RelatorioSection>
        )}

        {tipo === 'origem' && (
          <RelatorioSection
            isLoading={origemQuery.isLoading}
            error={origemQuery.error as Error | null}
            generatedAt={origemQuery.data?.generatedAt}
            total={origemQuery.data?.total}
          >
            {(origemQuery.data?.distribuicao ?? []).length === 0 && (
              <Empty>Nenhum agendamento no periodo.</Empty>
            )}
            <OrigemChart items={origemQuery.data?.distribuicao ?? []} />
          </RelatorioSection>
        )}
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RelatorioSection({
  isLoading,
  error,
  generatedAt,
  total,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  generatedAt?: string;
  total?: number;
  children: React.ReactNode;
}) {
  if (isLoading) return <p>Carregando...</p>;
  if (error) return <p style={{ color: '#991b1b' }}>Erro: {error.message}</p>;
  return (
    <div>
      {generatedAt && (
        <div style={metaStyle}>
          Total: <strong>{total ?? 0}</strong> — Gerado em{' '}
          {formatDatetimePtBR(generatedAt)}
        </div>
      )}
      {children}
    </div>
  );
}

function AgendaDiaTable({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) return <Empty>Nenhum agendamento no periodo.</Empty>;
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <Th>Horario</Th>
          <Th>Paciente</Th>
          <Th>Profissional</Th>
          <Th>Tipo</Th>
          <Th>Status</Th>
          <Th>Origem</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((ag) => (
          <tr key={ag.id} style={{ borderTop: '1px solid #e2e8f0' }}>
            <Td>{formatDatetimePtBR(ag.dataHoraInicio)}</Td>
            <Td>{ag.paciente.nomeCompleto}</Td>
            <Td>{ag.profissional.nomeCompleto}</Td>
            <Td>{ag.tipo.replace(/_/g, ' ')}</Td>
            <Td>{ag.status.replace(/_/g, ' ')}</Td>
            <Td>{ag.origem.replace(/_/g, ' ')}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrigemChart({ items }: { items: OrigemEntry[] }) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  return (
    <div style={{ padding: 8 }}>
      {items.map((d) => (
        <div key={d.origem} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {d.origem.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {d.count} ({d.percentual}%)
            </span>
          </div>
          <div style={barBgStyle}>
            <div
              style={{
                ...barFillStyle,
                width: `${(d.count / maxCount) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#475569' }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a' }}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  marginBottom: 16,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 16,
  borderBottom: '2px solid #e2e8f0',
  paddingBottom: 2,
};

const tabStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  color: '#64748b',
  borderRadius: '6px 6px 0 0',
};

const activeTabStyle: React.CSSProperties = {
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
};

const filtersStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginBottom: 16,
  alignItems: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: '#64748b',
};

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const contentStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  overflow: 'hidden',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  padding: '10px 14px',
  borderBottom: '1px solid #e2e8f0',
};

const sectionTitleStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontWeight: 700,
  fontSize: 13,
  color: '#1d4ed8',
  background: '#eff6ff',
};

const barBgStyle: React.CSSProperties = {
  height: 14,
  borderRadius: 4,
  background: '#f1f5f9',
  overflow: 'hidden',
};

const barFillStyle: React.CSSProperties = {
  height: '100%',
  background: '#3b82f6',
  borderRadius: 4,
  transition: 'width 0.3s ease',
};
