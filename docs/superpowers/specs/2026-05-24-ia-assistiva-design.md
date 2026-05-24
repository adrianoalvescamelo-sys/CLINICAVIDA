# Design — IA Assistiva (Sprint 8, sub-projeto 3)

**Data:** 2026-05-24
**Status:** aprovado (brainstorming)
**Pré-requisito:** Prontuário base (sub-projeto 1) + Documentos PDF (sub-projeto 2) — ambos concluídos e no ar.
**Escopo:** backend-only. Frontend é sub-projeto futuro.

## Objetivo

IA assistiva para apoio clínico: gera resumo, hipótese diagnóstica, conduta e orientações.
**A IA nunca finaliza nada sozinha** — toda sugestão exige revisão e aprovação médica explícita.
Falha da IA nunca bloqueia o atendimento.

Origem na SPEC: Fase 2, feature `ia_agent` ("IA assistiva para apoio clínico com aprovação médica obrigatória").

## Decisões de negócio (brainstorming 2026-05-24)

- **Multi-provider:** Anthropic (Claude) + OpenAI, via Gateway próprio com fallback automático.
- **Entidade separada `SugestaoIA`:** sugestão não é prontuário oficial. Aprovação cria/alimenta uma Evolução SOAP via `ProntuarioService` existente.
- **Dados enviados ao provedor:** conteúdo clínico completo (inclui identificação do paciente). *Pendência operacional fora do código:* registrar DPA/consentimento com os provedores externos (LGPD). Mitigação futura possível: flag de redação opcional.
- **Backend-only** nesta entrega.

## Modelo de dados

Nova model Prisma `SugestaoIA`:

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `pacienteId` | FK → pacientes | obrigatório |
| `agendamentoId` | FK? → agendamentos | contexto opcional |
| `evolucaoId` | FK? → evolucoes | preenchido só na aprovação |
| `tipo` | enum `TipoSugestaoIA` | RESUMO \| HIPOTESE \| CONDUTA \| ORIENTACOES |
| `status` | enum `StatusSugestaoIA` | GERADA \| APROVADA \| REJEITADA \| FALHA |
| `provider` | string | anthropic \| openai \| stub (qual respondeu) |
| `modelo` | string | ex: claude-opus-4-7, gpt-4o |
| `promptVersao` | string | ex: `resumo@v1` |
| `conteudoGerado` | text? | null se FALHA |
| `conteudoAprovado` | text? | texto final editado pelo médico |
| `tokensPrompt` | int? | |
| `tokensResposta` | int? | |
| `erroMensagem` | string? | preenchido se FALHA |
| `autorUsuarioId` | FK → usuarios | médico que solicitou |
| `aprovadoPorUsuarioId` | FK? → usuarios | |
| `aprovadoEm` | DateTime? | |
| `createdAt` | DateTime | |

`conteudoGerado` é imutável após geração (append-only, mesma filosofia das evoluções). Edição do médico vai em `conteudoAprovado`, sem alterar o gerado original (rastreabilidade do que a IA realmente produziu).

Migration nova: `<timestamp>_ia_sugestoes`.

## RBAC

| Perfil | Gerar | Aprovar/Rejeitar | Ler |
|--------|-------|------------------|-----|
| MÉDICO (`ehMedico` via Profissional, ou perfil MEDICO) | ✅ | ✅ | ✅ |
| ADMIN | ❌ | ❌ | ✅ (sugestões + logs) |
| RECEPÇÃO | ❌ 403 | ❌ 403 | ❌ 403 |
| PROFISSIONAL_NÃO_MÉDICO | ❌ 403 | ❌ 403 | ❌ 403 |

Espelha o RBAC do prontuário (helper `ehMedico` reutilizado). Aprovação é ato humano médico — IA nunca finaliza.
Tentativa sem permissão → 403 + audit `NEGADO`.

## AI Gateway

Módulo `backend/src/ai/`:

- **`AiGatewayService.gerar({ tipo, contexto })`** orquestra:
  1. monta prompt versionado para o `tipo`;
  2. chama provider default (`AI_PROVIDER_DEFAULT`);
  3. retry 1x no mesmo provider em erro transitório/timeout;
  4. fallback ao outro provider se default continuar falhando (edge case "modelo indisponível → fallback");
  5. retorna `{ provider, modelo, conteudo, tokensPrompt, tokensResposta }`.
- **Interface `AiProvider`** `{ nome: string; gerar(req: AiRequest): Promise<AiResult> }`.
- **Adapters:**
  - `AnthropicProvider` — SDK `@anthropic-ai/sdk`. Prompt caching no system prompt (TTL 5 min) para reduzir custo.
  - `OpenAiProvider` — SDK `openai`.
  - `StubProvider` — determinístico, sem rede. Default em ambiente de teste e quando keys ausentes.
- **Timeout:** `AI_TIMEOUT_MS` (default 60000). **Retry:** 1x (alinhado à SPEC). **Falha total:** lança erro tratado → sugestão fica `FALHA`; atendimento NÃO bloqueia.
- **Resposta vazia:** não conta como sugestão válida → `FALHA` / 422.

## Prompts versionados

`backend/src/ai/prompts/` — um arquivo por tipo, exporta `{ versao, system, montarUser(contexto) }`.
A versão usada é gravada em `SugestaoIA.promptVersao`. Trocar prompt = bump de versão; histórico fica rastreável por sugestão.
Edge case token-limit: prompts instruem resposta concisa + cap `AI_MAX_TOKENS`.

Contexto montado: dados clínicos do paciente + evoluções atuais (`replacedBy: null`) + agendamento, quando informado.

## Endpoints

Todos sob JWT + RBAC acima.

- `POST /api/pacientes/:id/ia/sugestoes` — body `{ tipo, agendamentoId? }`. Gera sugestão.
  - 201 com `SugestaoIA` (status GERADA) em sucesso.
  - 422 / status FALHA se IA indisponível ou resposta vazia (resposta limpa, não bloqueia).
- `GET /api/pacientes/:id/ia/sugestoes` — lista do paciente (médico/admin).
- `GET /api/ia/sugestoes/:id` — detalhe (audita VISUALIZACAO).
- `POST /api/ia/sugestoes/:id/aprovar` — body `{ conteudoAprovado }` → cria Evolução via `ProntuarioService`, grava `evolucaoId`, status APROVADA.
- `POST /api/ia/sugestoes/:id/rejeitar` — body `{ motivo? }` → status REJEITADA.

## Erros / edge cases

- Modelo indisponível → fallback provider; ambos falham → status FALHA + audit, sem bloquear atendimento.
- Resposta vazia → não salva como válida (FALHA / 422).
- Aprovar/rejeitar sugestão já APROVADA ou REJEITADA → 409.
- Aprovar sugestão com status FALHA → 422.
- `AI_ENABLED=false` → endpoints de geração retornam indisponibilidade limpa (sem 500).
- Paciente inexistente → 404.
- Sugestão inexistente → 404.

## Auditoria

- `GERACAO_SUGESTAO_IA` — detalhes incluem provider, modelo, promptVersao, tokens.
- `APROVACAO_SUGESTAO_IA` — inclui evolucaoId criado.
- `REJEICAO_SUGESTAO_IA`.
- `VISUALIZACAO_SUGESTAO_IA` (LGPD, igual prontuário).
- `NEGADO` em qualquer tentativa sem permissão.

## Variáveis de ambiente

| Var | Default | Notas |
|-----|---------|-------|
| `AI_ENABLED` | `true` | desliga geração sem quebrar app |
| `AI_PROVIDER_DEFAULT` | `anthropic` | anthropic \| openai |
| `ANTHROPIC_API_KEY` | — | obrigatória se provider anthropic ativo |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` | |
| `OPENAI_API_KEY` | — | obrigatória se provider openai ativo |
| `OPENAI_MODEL` | `gpt-4o` | |
| `AI_TIMEOUT_MS` | `60000` | |
| `AI_MAX_TOKENS` | `1024` | cap de resposta |

Em ambiente de teste / sem keys → `StubProvider`, sem chamada de rede.

## Testes (TDD)

**Unit:**
- `AiGatewayService`: fallback default→outro, retry 1x, resposta vazia → FALHA, `AI_ENABLED=false`.
- `StubProvider`: saída determinística.
- `SugestaoIaService`: RBAC por perfil, aprovar → cria Evolução + grava evolucaoId, estados inválidos (409/422), paciente/sugestão inexistente (404).

**E2e:**
- fluxo gerar → aprovar → evolução criada;
- RBAC por perfil (médico ok; recepção/admin/não-médico conforme tabela);
- IA desligada;
- sugestão/paciente inexistente.

**GOTCHA:** e2e roda serial (`--runInBand`) — contenção de DB causa falhas em paralelo (documentado nos sub-projetos anteriores).

## Fora de escopo

- Frontend (sub-projeto futuro).
- Redação/anonimização de dados antes do envio (decisão: conteúdo completo).
- Provedores além de Anthropic/OpenAI.
- Streaming de resposta.
