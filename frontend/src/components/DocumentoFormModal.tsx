import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgendamentos } from '../api/agenda';
import { criarDocumento } from '../api/documentos';
import { useModalA11y } from '../hooks/useModalA11y';
import { useAuthStore } from '../store/auth';
import { LABEL_TIPO, type TipoDocumento, type Medicamento } from '../types/documento';

interface Props {
  open: boolean;
  pacienteId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentoFormModal({ open, pacienteId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);
  const ehMedico = useAuthStore((s) => s.user)?.perfil === 'MEDICO';

  const tiposDisponiveis: TipoDocumento[] = ehMedico
    ? ['RECEITA', 'ATESTADO', 'PEDIDO_EXAME', 'ORIENTACOES']
    : ['PEDIDO_EXAME', 'ORIENTACOES'];

  const [tipo, setTipo] = useState<TipoDocumento>(tiposDisponiveis[0]);
  const [agendamentoId, setAgendamentoId] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [texto, setTexto] = useState('');
  const [diasAfastamento, setDias] = useState('');
  const [cid, setCid] = useState('');
  const [motivo, setMotivo] = useState('');
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([{ nome: '', posologia: '' }]);
  const [exames, setExames] = useState<string[]>(['']);

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', 'paciente', pacienteId],
    queryFn: () => listAgendamentos({ pacienteId }),
    enabled: open,
  });

  if (!open) return null;

  function montarConteudo(): Record<string, unknown> | null {
    if (tipo === 'ORIENTACOES') {
      if (!texto.trim()) return null;
      return { texto: texto.trim() };
    }
    if (tipo === 'ATESTADO') {
      const dias = Number(diasAfastamento);
      if (!Number.isInteger(dias) || dias < 1) return null;
      return { diasAfastamento: dias, ...(cid ? { cid } : {}), ...(motivo ? { motivo } : {}) };
    }
    if (tipo === 'RECEITA') {
      const meds = medicamentos.filter((m) => m.nome.trim() && m.posologia.trim());
      if (meds.length === 0) return null;
      return { medicamentos: meds };
    }
    const ex = exames.map((e) => e.trim()).filter(Boolean);
    if (ex.length === 0) return null;
    return { exames: ex };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const conteudo = montarConteudo();
    if (!conteudo) { setErro('Preencha os campos obrigatórios do documento.'); return; }
    setSalvando(true);
    try {
      await criarDocumento(pacienteId, {
        tipo, conteudo, agendamentoId: agendamentoId || undefined,
      });
      onSaved();
    } catch {
      setErro('Falha ao emitir documento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlay}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Novo documento" style={modal}>
        <h2 style={{ marginTop: 0 }}>Novo documento</h2>
        <form onSubmit={handleSubmit}>
          <label style={lbl}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} style={inp}>
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO[t]}</option>
              ))}
            </select>
          </label>

          <label style={lbl}>
            Agendamento (opcional)
            <select value={agendamentoId} onChange={(e) => setAgendamentoId(e.target.value)} style={inp}>
              <option value="">Sem vínculo</option>
              {agendamentos?.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.dataHoraInicio).toLocaleString('pt-BR')} — {a.profissional.nomeCompleto}
                </option>
              ))}
            </select>
          </label>

          {tipo === 'ORIENTACOES' && (
            <label style={lbl}>
              Texto
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} style={inp} />
            </label>
          )}

          {tipo === 'ATESTADO' && (
            <>
              <label style={lbl}>
                Dias de afastamento
                <input type="number" min={1} value={diasAfastamento}
                  onChange={(e) => setDias(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                CID (opcional)
                <input value={cid} onChange={(e) => setCid(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                Motivo (opcional)
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} style={inp} />
              </label>
            </>
          )}

          {tipo === 'RECEITA' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Medicamentos</div>
              {medicamentos.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input aria-label={`medicamento ${i + 1} nome`} placeholder="Nome" value={m.nome}
                    onChange={(e) => setMedicamentos(upd(medicamentos, i, { ...m, nome: e.target.value }))}
                    style={{ ...inp, flex: 1 }} />
                  <input aria-label={`medicamento ${i + 1} posologia`} placeholder="Posologia" value={m.posologia}
                    onChange={(e) => setMedicamentos(upd(medicamentos, i, { ...m, posologia: e.target.value }))}
                    style={{ ...inp, flex: 1 }} />
                </div>
              ))}
              <button type="button" onClick={() => setMedicamentos([...medicamentos, { nome: '', posologia: '' }])} style={addBtn}>
                + Medicamento
              </button>
            </div>
          )}

          {tipo === 'PEDIDO_EXAME' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Exames</div>
              {exames.map((ex, i) => (
                <input key={i} aria-label={`exame ${i + 1}`} placeholder="Exame" value={ex}
                  onChange={(e) => setExames(upd(exames, i, e.target.value))}
                  style={{ ...inp, display: 'block', marginBottom: 6, width: '100%' }} />
              ))}
              <button type="button" onClick={() => setExames([...exames, ''])} style={addBtn}>
                + Exame
              </button>
            </div>
          )}

          {erro && <p style={{ color: '#991b1b', fontSize: 13 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnSec}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPri}>Emitir</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function upd<T>(arr: T[], i: number, v: T): T[] {
  const copy = [...arr];
  copy[i] = v;
  return copy;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 'min(560px, 92vw)',
  maxHeight: '90vh', overflowY: 'auto',
};
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569', marginBottom: 10,
};
const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
};
const addBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px dashed #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#1d4ed8',
};
const btnPri: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
