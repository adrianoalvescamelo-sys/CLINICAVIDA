import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPaciente, updatePaciente } from '../api/pacientes';
import PacienteForm from './PacienteForm';
import type { PacienteFormData } from '../types/paciente';

export default function PacienteDadosTab({ pacienteId }: { pacienteId: string }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['paciente', pacienteId],
    queryFn: () => getPaciente(pacienteId),
    enabled: !!pacienteId,
  });

  async function handleSubmit(form: PacienteFormData) {
    if (!data) return;
    setLoading(true);
    try {
      await updatePaciente(data.id, { ...form, updatedAt: data.updatedAt });
      await refetch();
      navigate('/pacientes');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <>
      <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
        Última atualização: {new Date(data.updatedAt).toLocaleString('pt-BR')}
      </p>
      <PacienteForm
        initial={{
          nomeCompleto: data.nomeCompleto,
          cpf: data.cpf,
          dataNascimento: data.dataNascimento,
          sexo: data.sexo,
          telefoneWhatsapp: data.telefoneWhatsapp,
          telefoneSecundario: data.telefoneSecundario ?? undefined,
          email: data.email ?? undefined,
          responsavelNome: data.responsavelNome ?? undefined,
          responsavelCpf: data.responsavelCpf ?? undefined,
          observacoes: data.observacoes ?? undefined,
        }}
        loading={loading}
        submitLabel="Salvar alterações"
        onSubmit={handleSubmit}
      />
    </>
  );
}
