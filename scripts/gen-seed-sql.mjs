#!/usr/bin/env node
// Gera SQL INSERT pra usuarios seed (workaround quando ts-node não disponível em container).
// Uso: node scripts/gen-seed-sql.mjs > seed.sql

import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const users = [
  { email: 'admin@clinicavida.local', senha: 'Admin@2026!', nome: 'Admin Sistema', perfil: 'ADMIN' },
  { email: 'recepcao@clinicavida.local', senha: 'Recepcao@2026!', nome: 'Recepção Demo', perfil: 'RECEPCAO' },
  { email: 'medico@clinicavida.local', senha: 'Medico@2026!', nome: 'Dr. Demo Médico', perfil: 'MEDICO' },
  { email: 'profissional@clinicavida.local', senha: 'Profissional@2026!', nome: 'Profissional Demo', perfil: 'PROFISSIONAL_NAO_MEDICO' },
];

console.log('-- Seed usuarios — gerado em', new Date().toISOString());
console.log('-- Trocar senhas IMEDIATAMENTE após primeiro login\n');

for (const u of users) {
  const hash = await argon2.hash(u.senha, { type: argon2.argon2id });
  const id = randomUUID();
  const escapedHash = hash.replace(/'/g, "''");
  const escapedNome = u.nome.replace(/'/g, "''");
  console.log(`INSERT INTO usuarios (id, email, senha_hash, nome_completo, perfil, ativo, tentativas_login, created_at, updated_at)`);
  console.log(`VALUES ('${id}', '${u.email}', '${escapedHash}', '${escapedNome}', '${u.perfil}', true, 0, NOW(), NOW())`);
  console.log(`ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, nome_completo = EXCLUDED.nome_completo, perfil = EXCLUDED.perfil, tentativas_login = 0, bloqueado_ate = NULL;\n`);
}
