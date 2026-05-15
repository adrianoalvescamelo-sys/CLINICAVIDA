/**
 * Setup global para testes e2e.
 * Define variáveis de ambiente necessárias antes da inicialização dos módulos NestJS.
 * Substitui .env.test para não depender do pacote dotenv.
 * Valores aqui são apenas para testes — não usar em produção.
 */

// Só seta se não estiver já definido (permite override via shell)
function setEnvIfMissing(key: string, value: string): void {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

setEnvIfMissing('NODE_ENV', 'test');
setEnvIfMissing('PORT', '3001');

// Banco — usa o mesmo DB de dev; testes isolam por sufixo de email @clinicavida.test
setEnvIfMissing(
  'DATABASE_URL',
  'postgresql://clinicavida:clinicavida_dev@localhost:5432/clinicavida?schema=public',
);

// JWT — segredos com >= 32 chars para satisfazer validateEnv
setEnvIfMissing(
  'JWT_SECRET',
  'test-jwt-secret-clinicavida-2026-devonly-min32chars',
);
setEnvIfMissing('JWT_EXPIRES_IN', '15m');
setEnvIfMissing(
  'JWT_REFRESH_SECRET',
  'test-refresh-secret-clinicavida-2026-devonly-min32chars',
);
setEnvIfMissing('JWT_REFRESH_EXPIRES_IN', '7d');

// Auth lockout
setEnvIfMissing('AUTH_MAX_ATTEMPTS', '5');
setEnvIfMissing('AUTH_LOCKOUT_MINUTES', '15');

// Segurança
setEnvIfMissing('CORS_ORIGIN', 'http://localhost:3001');
setEnvIfMissing('BOT_SECRET', 'test-bot-secret-clinicavida-2026-devonly');
setEnvIfMissing('TV_SECRET', 'test-tv-secret-clinicavida-2026-devonly');

// Log silencioso em testes
setEnvIfMissing('LOG_LEVEL', 'silent');

// WhatsApp desabilitado em testes
setEnvIfMissing('WA_ENABLED', 'false');
setEnvIfMissing('WA_DRY_RUN', 'true');
setEnvIfMissing('N8N_WEBHOOK_URL', 'http://localhost:9999/n8n-noop');
