#!/usr/bin/env node
// Seed CommonJS-compat (ESM .mjs) — não depende de ts-node.
// Executa em qualquer container que tenha `@prisma/client` e `argon2`
// (ambos em dependencies). Usado tanto em dev quanto em runtime
// (via `prisma db seed` conforme backend/package.json -> prisma.seed).

import { PrismaClient, PerfilTipo } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const usuarios = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@clinicavida.local',
    senha: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@2026!',
    nomeCompleto: 'Admin Sistema',
    perfil: PerfilTipo.ADMIN,
  },
  {
    email: process.env.SEED_RECEPCAO_EMAIL ?? 'recepcao@clinicavida.local',
    senha: process.env.SEED_RECEPCAO_PASSWORD ?? 'Recepcao@2026!',
    nomeCompleto: 'Recepção Demo',
    perfil: PerfilTipo.RECEPCAO,
  },
  {
    email: process.env.SEED_MEDICO_EMAIL ?? 'medico@clinicavida.local',
    senha: process.env.SEED_MEDICO_PASSWORD ?? 'Medico@2026!',
    nomeCompleto: 'Dr. Demo Médico',
    perfil: PerfilTipo.MEDICO,
  },
  {
    email:
      process.env.SEED_PROFISSIONAL_EMAIL ?? 'profissional@clinicavida.local',
    senha: process.env.SEED_PROFISSIONAL_PASSWORD ?? 'Profissional@2026!',
    nomeCompleto: 'Profissional Demo',
    perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  },
];

async function main() {
  const criados = [];

  for (const u of usuarios) {
    const senhaHash = await argon2.hash(u.senha, { type: argon2.argon2id });

    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        senhaHash,
        nomeCompleto: u.nomeCompleto,
        perfil: u.perfil,
      },
      create: {
        email: u.email,
        senhaHash,
        nomeCompleto: u.nomeCompleto,
        perfil: u.perfil,
      },
    });

    criados.push({ email: u.email, senha: u.senha });
    console.log(`Upserted: ${u.email} (${u.perfil})`);
  }

  // Credenciais em texto claro — APENAS dev/homolog, NUNCA em prod
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n--- CREDENCIAIS DE SEED (NÃO usar em prod) ---');
    for (const c of criados) {
      console.log(`  ${c.email}  /  ${c.senha}`);
    }
    console.log('----------------------------------------------\n');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
