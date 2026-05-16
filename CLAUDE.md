# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# App Clínica Vida — Guia de Orquestração

Aplicativo interno da **Clínica Vida Popular — Sinop/MT**. Uso exclusivo da clínica, não SaaS.

Especificação fonte: [`SPEC_App_Clinica_Vida_revisada.json`](./SPEC_App_Clinica_Vida_revisada.json) (v1.1, 2026-05-14).

## Stack alvo
- Web/PWA (sem app nativo no MVP).
- Integração WhatsApp via **n8n + Evolution API**.
- IA (Fase 2) via AI Gateway próprio.

## Agentes do projeto

Cada agente está em `.claude/agents/<nome>.md`. Invoque via Task tool conforme escopo.

| Agente | Sprint | Pré-requisito | Bloqueia |
|--------|--------|---------------|----------|
| `infra-auth` | 1 | — | todas |
| `pacientes` | 2 | infra-auth | agenda |
| `agenda` | 3 | pacientes | 4, 5, 6, 7 |
| `whatsapp` | 4 | agenda | — |
| `recepcao-paineis` | 5 + 6 | agenda | — |
| `relatorios` | 7 | agenda | — |
| `prontuario-ia` | 8 (Fase 2) | MVP aprovado | — |
| `qa-auditoria` | cross | sprint a validar | merge/deploy |

## Ordem de execução

```
Sprint 1 (infra-auth)
   ↓
Sprint 2 (pacientes)
   ↓
Sprint 3 (agenda)              ← núcleo crítico
   ↓
┌─ Sprint 4 (whatsapp)
├─ Sprint 5+6 (recepcao-paineis)   ← paraleliza
└─ Sprint 7 (relatorios)
   ↓
[MVP em produção, validado]
   ↓
Sprint 8 (prontuario-ia)       ← Fase 2
```

`qa-auditoria` roda ao final de cada sprint antes do merge.

## Fora do escopo do MVP
Financeiro, fluxo de caixa, pagamentos, faturamento, cobrança, telemedicina, portal do paciente, app nativo, prescrição digital avançada, assinatura digital, integração laboratório, controle de estoque.

## Decisões de negócio chave
- CPF obrigatório e único (bloqueia duplicidade).
- Admin e recepção editam qualquer dado cadastral.
- Confirmação WhatsApp: 24h antes + reenvio 2h antes se sem resposta.
- Cancelamento/remarcação automático até 2h antes; depois vira pendência para recepção.
- Conflito de agenda permite encaixe com confirmação manual.
- Bot cria pré-agendamento; recepção confirma.
- Painel TV exibe nome completo.
- IA apoia mas nunca finaliza sem aprovação médica.
- Unidade única no MVP (sem multiunidade).

## Padrões técnicos globais

**Schema resposta:**
```json
{ "success": bool, "data": obj|null, "error": { "code", "message", "details", "trace_id" } }
```

**Timeouts:** api 30s / n8n 10s / evolution 15s / ia 60s / drive 30s.

**Retry:** n8n+evolution 3x backoff / ia 1x / drive 2x.

**Payload:** 1 MB API / 10 MB upload.

## Perfis
- **Admin geral**: tudo.
- **Recepção**: cadastro, agenda, WhatsApp, confirmações. SEM prontuário.
- **Médico**: própria agenda, todos os dados do paciente, painel chamada, Fase 2 prontuário.
- **Profissional não médico**: própria agenda, dados básicos. SEM receita/atestado.

## Definition of Done (todas as features)
- Steps verificáveis concluídos.
- Input validado.
- Schema + status codes padrão.
- Logs + auditoria em ações críticas.
- Permissões testadas por perfil.
- Edge cases principais cobertos.
- Testes sucesso/erro/permissão.
- Docs env vars + integrações atualizadas.
- Deploy validado em homolog antes de prod.

## Modelo de dados resumo

**usuarios**: id (UUID), email (UNIQUE), senha_hash (argon2), nome_completo, perfil (ADMIN|RECEPCAO|MEDICO|PROFISSIONAL_NAO_MEDICO), ativo, tentativas_login, bloqueado_ate.

**pacientes**: id, cpf (UNIQUE, 11 chars), nome_completo, data_nascimento, sexo, telefone_whatsapp, telefone_secundario?, email?, responsavel_nome?, responsavel_cpf?, endereco (JSON)?, deleted_at (soft delete). Índices: nome_completo, telefone_whatsapp.

**profissionais**: id, nome_completo, especialidade?, registro_conselho?, eh_medico (bool), ativo, usuario_id? (UNIQUE FK → usuarios), cor (#RRGGBB)?.

**agendamentos**: id, paciente_id, profissional_id, data_hora_inicio, data_hora_fim, tipo (CONSULTA|RETORNO|EXAME|PROCEDIMENTO|OUTRO), status, origem (RECEPCAO|ADMIN|BOT_WHATSAPP|PACIENTE_WHATSAPP), encaixe (bool), event_id (UNIQUE idempotência).
Statuses: SOLICITADO, PRE_AGENDAMENTO, CONFIRMADO, CONFIRMACAO_TARDIA, AGUARDANDO, EM_ATENDIMENTO, ATENDIDO, FALTOU, CANCELADO.

**bloqueios_agenda**: id, profissional_id, data_hora_inicio, data_hora_fim, motivo?.

**lista_espera**: id, paciente_id, profissional_id?, especialidade?, prioridade (int), melhores_horarios (JSON)?, status (ATIVO|CONTATADO|RECUSADO|AGENDADO|CANCELADO).

**mensagens_whatsapp**: id, paciente_id?, agendamento_id?, telefone, direcao (OUTBOUND|INBOUND), tipo, status, tentativas, proximo_retry_em?, payload (JSON), event_id (UNIQUE).
Statuses: PENDENTE, ENVIADA, ENTREGUE, RESPONDIDA, FALHA, CANCELADA.
Tipos: CONFIRMACAO_24H, LEMBRETE_2H, CONFIRMACAO_TARDIA, CANCELAMENTO, REMARCACAO, VAGA_LIBERADA, CUSTOM.

**pacientes_historico** / **agendamentos_historico**: trilha de auditoria por entidade; armazenam `diff` (JSON), `status_anterior`, `status_novo`, `trace_id`.

**auditoria**: id, usuario_id?, acao, entidade, registro_id?, data_hora, ip_dispositivo?, resultado (SUCESSO|FALHA|NEGADO), trace_id, detalhes (JSON)?.

## Comandos de desenvolvimento

### Setup inicial
```bash
# Start DB
npm run dev:db

# Run migrations + seed
npm --workspace backend run prisma:migrate
npm --workspace backend run seed
```

### Backend (NestJS)
```bash
npm run dev:backend          # watch mode, porta 3000
npm --workspace backend test                    # unit tests (Jest)
npm --workspace backend run test:e2e            # e2e tests (requer DB rodando)
npm --workspace backend run test:cov            # coverage
npm --workspace backend run lint                # ESLint --fix
npm --workspace backend run prisma:studio       # GUI do banco

# Rodar um único arquivo de teste
npm --workspace backend test -- --testPathPattern=pacientes.service
npm --workspace backend run test:e2e -- --testPathPattern=auth
```

### Frontend (Vite + React)
```bash
npm run dev:frontend         # porta 5173
npm --workspace frontend test            # Vitest (run)
npm --workspace frontend run test:watch  # watch mode
npm --workspace frontend run lint        # ESLint max-warnings 0
npm --workspace frontend run build       # tsc + vite build
```

### Build completo + Docker
```bash
npm run build                            # backend + frontend
docker compose up -d                     # postgres + api
docker compose logs -f api               # acompanhar API
```

## Variáveis de ambiente obrigatórias (backend)

`DATABASE_URL`, `JWT_SECRET` (≥32 chars), `JWT_REFRESH_SECRET` (≥32 chars), `CORS_ORIGIN`, `BOT_SECRET`.

Opcionais com defaults: `PORT=3000`, `JWT_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`, `AUTH_MAX_ATTEMPTS=5`, `AUTH_LOCKOUT_MINUTES=15`, `LOG_LEVEL=info`, `N8N_WEBHOOK_URL`, `WA_ENABLED=true`, `WA_DRY_RUN=false`, `TV_SECRET`.

## Arquitetura

### Backend — NestJS monólito modular

Cada feature é um módulo independente em `backend/src/<feature>/`:
- `auth/` — JWT access token (15 min) + refresh token (7 dias), argon2, bloqueio por tentativas. Guards: `JwtAuthGuard` (global via APP_GUARD), `RolesGuard` (global via APP_GUARD), `BotAuthGuard` (header `x-bot-secret`), `TvAuthGuard` (header `x-tv-secret`).
- `pacientes/` — CRUD + soft delete + histórico de alterações em `pacientes_historico`.
- `agenda/` — agendamentos, bloqueios por profissional, detecção de conflitos, encaixe manual.
- `bot/` — endpoint público para pré-agendamento via WhatsApp (autenticado por `BOT_SECRET`).
- `profissionais/` — CRUD de profissionais; vínculo 1:1 opcional com `Usuario` via `usuarioId`; campo `ehMedico` controla permissões de prontuário/receita.
- `whatsapp/` — envio via n8n/Evolution API, retry com backoff, cron jobs em `whatsapp.cron.ts` (`@nestjs/schedule`), idempotência por `event_id`.
- `lista-espera/` — fila priorizada para recepcao.
- `recepcao/` — dashboard do dia + painel TV (autenticado por `TV_SECRET`).
- `config/` — `configuration.ts`, wiring do `ConfigModule` com variáveis de ambiente.
- `relatorios/` — agenda do dia, agendamentos por status, pacientes por período — exporta Excel/PDF.
- `audit/` — `AuditService.log()` gravado em toda ação crítica.
- `common/` — `ResponseInterceptor` (envelope global), `AllExceptionsFilter`, `TraceIdMiddleware` (injeta `trace_id` uuid por request), decorators `@Public()`, `@Roles()`, `@CurrentUser()`, `@SkipResponseInterceptor()`.

**Prisma** em `backend/prisma/schema.prisma`. `PrismaService` é singleton global via `PrismaModule` (exports `PrismaService`).

**Envelope de resposta global** (todos endpoints exceto `@SkipResponseInterceptor()`):
```json
{ "success": true, "data": <payload>, "error": null }
{ "success": false, "data": null, "error": { "code", "message", "details", "trace_id" } }
```

Rotas públicas: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /health`, `GET /ready`.

### Frontend — React + Vite + PWA

- **Roteamento**: `react-router-dom` v6, todas rotas protegidas por `PrivateRoute` (verifica token Zustand).
- **Estado de auth**: `zustand` em `frontend/src/store/auth.ts`.
- **HTTP**: `axios` com `baseURL: '/api'` em `frontend/src/api/client.ts`. Interceptor injeta Bearer token e redireciona para `/login` em 401.
- **Server state**: `@tanstack/react-query` v5.
- Cada domain tem seu módulo de API em `frontend/src/api/<domain>.ts`.

### Camadas cross-cutting

- `trace_id` (UUID v4) gerado por `TraceIdMiddleware` em cada request, propagado via `req.trace_id`, incluído em logs e erros.
- Rate limit global: 100 req/min por IP (`ThrottlerProxyGuard` lida com proxy X-Forwarded-For).
- Logs estruturados via `nestjs-pino`; `req.headers.authorization` e `req.body.senha` redacted automaticamente.
