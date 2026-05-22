import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProfissional, updateProfissional } from '../api/profissionais';
import Layout from '../components/Layout';
import ProfissionalForm from '../components/ProfissionalForm';
import type { ProfissionalUpdateData } from '../types/profissional';

export default function ProfissionalEditarPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profissional', id],
    queryFn: () => getProfissional(id!),
    enabled: !!id,
  });

  async function handleSubmit(form: ProfissionalUpdateData) {
    if (!data) return;
    setLoading(true);
    try {
      await updateProfissional(data.id, form);
      await refetch();
      navigate('/profissionais');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/profissionais"
          style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}
        >
          ← Profissionais
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>
        Editar profissional
      </h1>
      {data && (
        <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
          Última atualização:{' '}
          {new Date(data.updatedAt).toLocaleString('pt-BR')}
        </p>
      )}

      {isLoading && <p>Carregando…</p>}
      {isError && (
        <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>
      )}

      {data && (
        <ProfissionalForm
          initial={{
            nomeCompleto: data.nomeCompleto,
            especialidade: data.especialidade ?? undefined,
            registroConselho: data.registroConselho ?? undefined,
            ehMedico: data.ehMedico,
            usuarioId: data.usuarioId ?? undefined,
            cor: data.cor ?? undefined,
            ativo: data.ativo,
          }}
          loading={loading}
          showAtivo
          submitLabel="Salvar alterações"
          onSubmit={handleSubmit}
        />
      )}
    </Layout>
  );
}
