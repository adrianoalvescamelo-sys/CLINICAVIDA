import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  atualizarAgendamento,
  listAgendamentos,
  listarBloqueios,
  type Bloqueio,
} from '../api/agenda';
import { getConfiguracao } from '../api/configuracoes';
import type { AgendamentoListItem, AgendamentoStatus } from '../types/agenda';
import AgendaSlotModal from './AgendaSlotModal';
import BloqueioDetalheModal from './BloqueioDetalheModal';

const REMARCAVEL: AgendamentoStatus[] = [
  'SOLICITADO',
  'PRE_AGENDAMENTO',
  'CONFIRMADO',
  'CONFIRMACAO_TARDIA',
];

interface Props {
  semanaInicio: Date; // domingo da semana
  profissionalId?: string;
  profissionalNome?: string;
  onAgendamentoClick?: (a: AgendamentoListItem) => void;
}

const SLOT_MIN = 15;
const PX_POR_MIN = 1.4; // 15min ≈ 21px

function parseHoraToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const STATUS_COR: Record<AgendamentoStatus, { bg: string; border: string; fg: string }> =
  {
    SOLICITADO: { bg: '#e0e7ff', border: '#6366f1', fg: '#3730a3' },
    PRE_AGENDAMENTO: { bg: '#fef3c7', border: '#d97706', fg: '#92400e' },
    CONFIRMADO: { bg: '#dbeafe', border: '#3b82f6', fg: '#1e40af' },
    CONFIRMACAO_TARDIA: { bg: '#fde68a', border: '#f59e0b', fg: '#92400e' },
    AGUARDANDO: { bg: '#e0f2fe', border: '#0ea5e9', fg: '#075985' },
    EM_ATENDIMENTO: { bg: '#ccfbf1', border: '#14b8a6', fg: '#115e59' },
    ATENDIDO: { bg: '#dcfce7', border: '#16a34a', fg: '#14532d' },
    FALTOU: { bg: '#fee2e2', border: '#ef4444', fg: '#991b1b' },
    CANCELADO: { bg: '#f1f5f9', border: '#94a3b8', fg: '#475569' },
  };

const DIAS_LABEL = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function fmtDataBR(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function isMesmoDia(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function minDeMeiaNoite(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function dataParaIsoDia(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AgendaSemana({
  semanaInicio,
  profissionalId,
  profissionalNome,
  onAgendamentoClick,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState('');
  const [modalHora, setModalHora] = useState('');
  const [bloqueioSelecionado, setBloqueioSelecionado] = useState<Bloqueio | null>(
    null,
  );
  const [draggedAg, setDraggedAg] = useState<AgendamentoListItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // "dia-idx:hora"
  const qc = useQueryClient();

  const remarcar = useMutation({
    mutationFn: (args: { id: string; inicio: Date; fim: Date }) =>
      atualizarAgendamento(args.id, {
        dataHoraInicio: args.inicio.toISOString(),
        dataHoraFim: args.fim.toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agendamentos'] }),
    onError: (err) => {
      const e = err as {
        response?: { data?: { error?: { message?: string | string[] } } };
      };
      const m = e?.response?.data?.error?.message;
      const msg = Array.isArray(m) ? m.join(', ') : (m ?? 'Erro ao remarcar');
      window.alert(msg);
    },
  });

  function handleDrop(dia: Date, hora: string) {
    if (!draggedAg) return;
    const ag = draggedAg;
    setDraggedAg(null);
    setDropTarget(null);
    const [h, m] = hora.split(':').map(Number);
    const novoIni = new Date(dia);
    novoIni.setHours(h, m, 0, 0);
    const duracaoMs =
      new Date(ag.dataHoraFim).getTime() - new Date(ag.dataHoraInicio).getTime();
    const novoFim = new Date(novoIni.getTime() + duracaoMs);
    if (novoIni.getTime() === new Date(ag.dataHoraInicio).getTime()) return;
    if (
      !window.confirm(
        `Remarcar ${ag.paciente.nomeCompleto} para ${novoIni.toLocaleString('pt-BR')}?`,
      )
    )
      return;
    remarcar.mutate({ id: ag.id, inicio: novoIni, fim: novoFim });
  }

  const { data: cfg } = useQuery({
    queryKey: ['configuracao'],
    queryFn: getConfiguracao,
    staleTime: 60_000,
  });

  const horaIniMin = cfg ? parseHoraToMin(cfg.horaAbertura) : 7 * 60;
  const horaFimMin = cfg ? parseHoraToMin(cfg.horaFechamento) : 19 * 60;
  const diasFunc = cfg?.diasFuncionamento ?? [1, 2, 3, 4, 5, 6];
  const almocoIniMin = cfg?.intervaloAlmocoIni
    ? parseHoraToMin(cfg.intervaloAlmocoIni)
    : null;
  const almocoFimMin = cfg?.intervaloAlmocoFim
    ? parseHoraToMin(cfg.intervaloAlmocoFim)
    : null;

  function pxPosicao(min: number) {
    return (min - horaIniMin) * PX_POR_MIN;
  }

  const dias = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(semanaInicio);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [semanaInicio]);

  const inicioStr = useMemo(() => {
    const d = new Date(semanaInicio);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [semanaInicio]);

  const fimStr = useMemo(() => {
    const d = new Date(semanaInicio);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [semanaInicio]);

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', inicioStr, fimStr, profissionalId],
    queryFn: () =>
      listAgendamentos({
        inicio: inicioStr,
        fim: fimStr,
        profissionalId: profissionalId || undefined,
      }),
  });

  const { data: bloqueios } = useQuery({
    queryKey: ['bloqueios', profissionalId],
    queryFn: () => listarBloqueios(profissionalId || undefined),
  });

  const slots = useMemo(() => {
    const arr: string[] = [];
    for (let t = horaIniMin; t < horaFimMin; t += SLOT_MIN) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    return arr;
  }, [horaIniMin, horaFimMin]);

  const alturaTotal = (horaFimMin - horaIniMin) * PX_POR_MIN;

  const agora = new Date();

  function handleSlotClick(dia: Date, hora: string) {
    setModalData(dataParaIsoDia(dia));
    setModalHora(hora);
    setModalOpen(true);
  }

  function agendamentosDoDia(dia: Date): AgendamentoListItem[] {
    if (!agendamentos) return [];
    return agendamentos.filter((a) => isMesmoDia(new Date(a.dataHoraInicio), dia));
  }

  function bloqueiosDoDia(dia: Date): Bloqueio[] {
    if (!bloqueios) return [];
    return bloqueios.filter((b) => {
      const ini = new Date(b.dataHoraInicio);
      const fim = new Date(b.dataHoraFim);
      // Bloqueio sobrepõe o dia
      const diaIni = new Date(dia);
      diaIni.setHours(0, 0, 0, 0);
      const diaFim = new Date(dia);
      diaFim.setHours(23, 59, 59, 999);
      return ini <= diaFim && fim >= diaIni;
    });
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        overflow: 'auto',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px repeat(7, 1fr)',
          minWidth: 800,
        }}
      >
        {/* Header */}
        <div style={{ ...headerStyle, borderRight: '1px solid #e2e8f0' }}></div>
        {dias.map((d, i) => {
          const hoje = isMesmoDia(d, agora);
          const funciona = diasFunc.includes(d.getDay());
          return (
            <div
              key={i}
              style={{
                ...headerStyle,
                borderRight: '1px solid #e2e8f0',
                background: hoje ? '#ccfbf1' : funciona ? '#f8fafc' : '#e2e8f0',
                opacity: funciona ? 1 : 0.65,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                {DIAS_LABEL[i]}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{fmtDataBR(d)}</div>
              {!funciona && (
                <div style={{ fontSize: 10, color: '#64748b' }}>(fechado)</div>
              )}
            </div>
          );
        })}

        {/* Coluna horas */}
        <div
          style={{
            borderRight: '1px solid #e2e8f0',
            position: 'relative',
            height: alturaTotal,
          }}
        >
          {slots.map((h, idx) => {
            const showHour = h.endsWith(':00');
            return (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: idx * SLOT_MIN * PX_POR_MIN,
                  width: '100%',
                  height: SLOT_MIN * PX_POR_MIN,
                  borderTop: showHour ? '1px solid #cbd5e1' : '1px dashed #e2e8f0',
                  fontSize: 11,
                  color: '#64748b',
                  paddingLeft: 6,
                  paddingTop: 2,
                }}
              >
                {showHour ? h : ''}
              </div>
            );
          })}
        </div>

        {/* Colunas dias */}
        {dias.map((dia, di) => {
          const dayAgs = agendamentosDoDia(dia);
          const dayBls = bloqueiosDoDia(dia);
          const hoje = isMesmoDia(dia, agora);
          const funciona = diasFunc.includes(dia.getDay());
          return (
            <div
              key={di}
              style={{
                borderRight: '1px solid #e2e8f0',
                position: 'relative',
                height: alturaTotal,
                background: !funciona
                  ? 'repeating-linear-gradient(45deg, #f1f5f9 0 8px, #e2e8f0 8px 16px)'
                  : hoje
                    ? '#fefce8'
                    : '#fff',
                opacity: funciona ? 1 : 0.6,
              }}
            >
              {/* Grid clicável + drop target */}
              {slots.map((h, idx) => {
                const tgtKey = `${di}:${h}`;
                const isTarget = draggedAg && dropTarget === tgtKey;
                return (
                  <div
                    key={h}
                    onClick={() => handleSlotClick(dia, h)}
                    onDragOver={(e) => {
                      if (!draggedAg) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropTarget !== tgtKey) setDropTarget(tgtKey);
                    }}
                    onDragLeave={() => {
                      if (dropTarget === tgtKey) setDropTarget(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(dia, h);
                    }}
                    style={{
                      position: 'absolute',
                      top: idx * SLOT_MIN * PX_POR_MIN,
                      width: '100%',
                      height: SLOT_MIN * PX_POR_MIN,
                      borderTop: h.endsWith(':00')
                        ? '1px solid #cbd5e1'
                        : '1px dashed #e2e8f0',
                      cursor: 'pointer',
                      background: isTarget ? 'rgba(20, 184, 166, 0.25)' : undefined,
                    }}
                  />
                );
              })}

              {/* Linha hora atual */}
              {hoje && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: pxPosicao(minDeMeiaNoite(agora)),
                    borderTop: '2px solid #ef4444',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Faixa almoço */}
              {almocoIniMin !== null && almocoFimMin !== null && (
                <div
                  title="Horário de almoço"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: pxPosicao(almocoIniMin),
                    height: (almocoFimMin - almocoIniMin) * PX_POR_MIN,
                    background: 'rgba(241,245,249,0.7)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Bloqueios */}
              {dayBls.map((b) => {
                const ini = new Date(b.dataHoraInicio);
                const fim = new Date(b.dataHoraFim);
                const diaIni = new Date(dia);
                const horaIni = Math.floor(horaIniMin / 60);
                const minIni = horaIniMin % 60;
                diaIni.setHours(horaIni, minIni, 0, 0);
                const diaFim = new Date(dia);
                const horaFim = Math.floor(horaFimMin / 60);
                const minFim = horaFimMin % 60;
                diaFim.setHours(horaFim, minFim, 0, 0);
                const clampedIni = ini < diaIni ? diaIni : ini;
                const clampedFim = fim > diaFim ? diaFim : fim;
                const top = pxPosicao(minDeMeiaNoite(clampedIni));
                const height =
                  (clampedFim.getTime() - clampedIni.getTime()) / 60000 *
                  PX_POR_MIN;
                if (height <= 0) return null;
                return (
                  <div
                    key={b.id}
                    title={b.motivo ?? 'Bloqueado — clique para gerenciar'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBloqueioSelecionado(b);
                    }}
                    style={{
                      position: 'absolute',
                      top,
                      left: 2,
                      right: 2,
                      height,
                      background:
                        'repeating-linear-gradient(45deg, #e2e8f0 0 6px, #cbd5e1 6px 12px)',
                      borderRadius: 4,
                      padding: 4,
                      fontSize: 11,
                      color: '#475569',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                  >
                    {b.motivo ?? 'Bloqueado'}
                  </div>
                );
              })}

              {/* Agendamentos */}
              {dayAgs.map((a) => {
                const ini = new Date(a.dataHoraInicio);
                const fim = new Date(a.dataHoraFim);
                const top = pxPosicao(minDeMeiaNoite(ini));
                const height =
                  (fim.getTime() - ini.getTime()) / 60000 * PX_POR_MIN;
                const cor = STATUS_COR[a.status];
                const draggable = REMARCAVEL.includes(a.status);
                const sendoArrastado = draggedAg?.id === a.id;
                return (
                  <div
                    key={a.id}
                    draggable={draggable}
                    onDragStart={(e) => {
                      setDraggedAg(a);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', a.id);
                    }}
                    onDragEnd={() => {
                      setDraggedAg(null);
                      setDropTarget(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgendamentoClick?.(a);
                    }}
                    title={draggable ? 'Arraste para remarcar' : undefined}
                    style={{
                      position: 'absolute',
                      top,
                      left: 4,
                      right: 4,
                      height: Math.max(height, 22),
                      background: cor.bg,
                      borderLeft: `4px solid ${a.profissional.cor ?? cor.border}`,
                      borderRadius: 4,
                      padding: '4px 6px',
                      fontSize: 11,
                      color: cor.fg,
                      cursor: draggable ? 'grab' : 'pointer',
                      overflow: 'hidden',
                      zIndex: 3,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      opacity: sendoArrastado ? 0.4 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {ini.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      -{' '}
                      {fim.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {a.paciente.nomeCompleto}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <AgendaSlotModal
        open={modalOpen}
        data={modalData}
        hora={modalHora}
        profissionalId={profissionalId}
        profissionalNome={profissionalNome}
        onClose={() => setModalOpen(false)}
      />

      <BloqueioDetalheModal
        bloqueio={bloqueioSelecionado}
        onClose={() => setBloqueioSelecionado(null)}
      />
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'center',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 5,
};
