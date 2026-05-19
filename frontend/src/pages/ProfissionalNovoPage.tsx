import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProfissional } from '../api/profissionais';
import Layout from '../components/Layout';
import ProfissionalForm from '../components/ProfissionalForm';
import type { ProfissionalUpdateData } from '../types/profissional';

export default function ProfissionalNovoPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(data: ProfissionalUpdateData) {
    setLoading(true);
    try {
      const { ativo: _ignored, ...createData } = data;
      void _ignored;
      const p = await createProfissional(createData);
      navigate(`/profissionais/${p.id}`, { replace: true });
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
      <h1 style={{ marginTop: 0, marginBottom: 24, color: '#0f172a' }}>
        Novo profissional
      </h1>
      <ProfissionalForm
        loading={loading}
        submitLabel="Cadastrar profissional"
        onSubmit={handleSubmit}
      />
    </Layout>
  );
}
