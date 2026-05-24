export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    maxAttempts: parseInt(process.env.AUTH_MAX_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? '15', 10),
  },
  security: {
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    botSecret: process.env.BOT_SECRET ?? '',
    tvSecret: process.env.TV_SECRET ?? '',
  },
  whatsapp: {
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
    n8nTimeoutMs: parseInt(process.env.N8N_TIMEOUT_MS ?? '10000', 10),
    maxTentativas: parseInt(process.env.WA_MAX_TENTATIVAS ?? '3', 10),
    confirmacaoHorasAntes: parseInt(
      process.env.WA_CONFIRMACAO_HORAS ?? '24',
      10,
    ),
    lembreteHorasAntes: parseInt(process.env.WA_LEMBRETE_HORAS ?? '2', 10),
    limiteAutoHoras: parseInt(process.env.WA_LIMITE_AUTO_HORAS ?? '2', 10),
    enabled: (process.env.WA_ENABLED ?? 'true').toLowerCase() === 'true',
    dryRun: (process.env.WA_DRY_RUN ?? 'false').toLowerCase() === 'true',
    // Lista de números (só dígitos) que recebem envio real durante rollout gradual.
    // Vazio = sem restrição (todos elegíveis recebem, sujeito a dryRun global).
    // Preenchido = apenas estes recebem real; demais são forçados a dry-run.
    allowlist: (process.env.WA_ALLOWLIST ?? '')
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .filter((n) => n.length > 0),
  },
  ai: {
    enabled: (process.env.AI_ENABLED ?? 'true').toLowerCase() === 'true',
    providerDefault: (
      process.env.AI_PROVIDER_DEFAULT ?? 'anthropic'
    ).toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '1024', 10),
  },
});

export function validateEnv(config: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGIN',
    'BOT_SECRET',
    'TV_SECRET',
  ];
  const missing = required.filter((k) => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`,
    );
  }
  if (typeof config.JWT_SECRET === 'string' && config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres');
  }
  if (
    typeof config.JWT_REFRESH_SECRET === 'string' &&
    config.JWT_REFRESH_SECRET.length < 32
  ) {
    throw new Error('JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres');
  }
  if (typeof config.TV_SECRET === 'string' && config.TV_SECRET.length < 16) {
    throw new Error('TV_SECRET deve ter pelo menos 16 caracteres');
  }
  return config;
}
