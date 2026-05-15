import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPaciente, updatePaciente } from '../api/pacientes';
import Layout from '../components/Layout';
import PacienteForm from '../components/PacienteForm';
import type { PacienteFormData } from '../types/paciente';

export default function PacienteEditarPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['paciente', id],
    queryFn: () => getPaciente(id!),
    enabled: !!id,
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

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/pacientes"
          style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}
        >
          ← Pacientes
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>
        Editar paciente
      </h1>
      {data && (
        <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
          Última atualização:{' '}
          {new Date(data.updatedAt).toLocaleString('pt-BR')}
        </p>
      )}

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>
          Erro: {(error as Error).message}
        </p>
      )}

      {data && (
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
      )}
    </Layout>
  );
}
