import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgendamentos } from '../api/agenda';
import { criarEvolucao } from '../api/prontuario';
import { useModalA11y } from '../hooks/useModalA11y';

interface Props {
  open: boolean;
  pacienteId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function EvolucaoFormModal({ open, pacienteId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const [agendamentoId, setAgendamentoId] = useState('');
  const [queixaPrincipal, setQueixa] = useState('');
  const [subjetivo, setSubjetivo] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [avaliacao, setAvaliacao] = useState('');
  const [plano, setPlano] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setAgendamentoId('');
      setQueixa('');
      setSubjetivo('');
      setObjetivo('');
      setAvaliacao('');
      setPlano('');
      setErro('');
    }
  }, [open]);

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', 'paciente', pacienteId],
    queryFn: () => listAgendamentos({ pacienteId }),
    enabled: open,
  });

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!agendamentoId) { setErro('Selecione um agendamento.'); return; }
    if (!subjetivo || !objetivo || !avaliacao || !plano) {
      setErro('Preencha todos os campos SOAP.'); return;
    }
    setSalvando(true);
    try {
      await criarEvolucao(pacienteId, {
        agendamentoId,
        queixaPrincipal: queixaPrincipal || undefined,
        subjetivo, objetivo, avaliacao, plano,
      });
      onSaved();
    } catch {
      setErro('Falha ao salvar evolução.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlay}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Nova evolução" style={modal}>
        <h2 style={{ marginTop: 0 }}>Nova evolução</h2>
        <form onSubmit={handleSubmit}>
          <label style={lbl}>
            Agendamento
            <select value={agendamentoId} onChange={(e) => setAgendamentoId(e.target.value)} style={inp}>
              <option value="">Selecione…</option>
              {agendamentos?.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.dataHoraInicio).toLocaleString('pt-BR')} — {a.profissional.nomeCompleto}
                </option>
              ))}
            </select>
          </label>
          <Field label="Queixa principal" value={queixaPrincipal} onChange={setQueixa} />
          <Field label="Subjetivo" value={subjetivo} onChange={setSubjetivo} required />
          <Field label="Objetivo" value={objetivo} onChange={setObjetivo} required />
          <Field label="Avaliação" value={avaliacao} onChange={setAvaliacao} required />
          <Field label="Plano" value={plano} onChange={setPlano} required />
          {erro && <p style={{ color: '#991b1b', fontSize: 13 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnSec}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPri}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <label style={lbl}>
      {label}{required ? ' *' : ''}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={inp} />
    </label>
  );
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
const btnPri: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
