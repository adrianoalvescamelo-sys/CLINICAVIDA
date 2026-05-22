#!/usr/bin/env node
// Gera secrets fortes para .env.homolog / .env.prod
// Uso: node scripts/gen-secrets.mjs

import { randomBytes } from 'node:crypto';

function gen(bytes) {
  return randomBytes(bytes).toString('hex');
}

const secrets = {
  POSTGRES_PASSWORD: gen(24), // 48 chars hex
  JWT_SECRET: gen(48), // 96 chars hex
  JWT_REFRESH_SECRET: gen(48),
  BOT_SECRET: gen(24),
  TV_SECRET: gen(24),
};

console.log('# --- COPIE PARA .env.homolog --- #\n');
for (const [k, v] of Object.entries(secrets)) {
  console.log(`${k}=${v}`);
}
console.log('\n# Gerado em', new Date().toISOString());
