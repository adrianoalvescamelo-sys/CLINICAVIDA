import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPaciente } from '../api/pacientes';
import Layout from '../components/Layout';
import PacienteForm from '../components/PacienteForm';
import type { PacienteFormData } from '../types/paciente';

export default function PacienteNovoPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(data: PacienteFormData) {
    setLoading(true);
    try {
      const p = await createPaciente(data);
      navigate(`/pacientes/${p.id}`, { replace: true });
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
      <h1 style={{ marginTop: 0, marginBottom: 24, color: '#0f172a' }}>
        Novo paciente
      </h1>
      <PacienteForm
        loading={loading}
        submitLabel="Cadastrar paciente"
        onSubmit={handleSubmit}
      />
    </Layout>
  );
}
