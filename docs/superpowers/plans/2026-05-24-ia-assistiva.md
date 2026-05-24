# IA Assistiva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend de IA assistiva clínica: Gateway multi-provider (Anthropic + OpenAI + stub) gera sugestões (resumo/hipótese/conduta/orientações) que o médico revisa e aprova, virando evolução SOAP. IA nunca finaliza sozinha; falha não bloqueia atendimento.

**Architecture:** Módulo `backend/src/ai/`. `AiGatewayService` orquestra providers via interface `AiProvider` com retry 1x + fallback cross-provider. `SugestaoIaService` aplica RBAC, monta contexto clínico, persiste `SugestaoIA`, e na aprovação reusa `ProntuarioService.criarEvolucao`. Prompts versionados em arquivos. Tudo auditado.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@anthropic-ai/sdk`, `openai`, Jest. Padrão de envelope/guards/audit já existente no projeto.

---

## File Structure

- Create: `backend/src/ai/ai.module.ts` — wiring do módulo
- Create: `backend/src/ai/ai-gateway.service.ts` — orquestra providers (retry/fallback/disabled)
- Create: `backend/src/ai/ai-gateway.service.spec.ts`
- Create: `backend/src/ai/providers/ai-provider.interface.ts` — interface + tipos `AiRequest`/`AiResult` + token de DI
- Create: `backend/src/ai/providers/stub.provider.ts` — provider determinístico (test/sem-key)
- Create: `backend/src/ai/providers/stub.provider.spec.ts`
- Create: `backend/src/ai/providers/anthropic.provider.ts` — adapter Claude (prompt caching no system)
- Create: `backend/src/ai/providers/openai.provider.ts` — adapter OpenAI
- Create: `backend/src/ai/prompts/index.ts` — registry de prompts versionados por tipo
- Create: `backend/src/ai/sugestao-ia.service.ts` — RBAC, geração, listagem, aprovação, rejeição
- Create: `backend/src/ai/sugestao-ia.service.spec.ts`
- Create: `backend/src/ai/sugestao-ia.controller.ts` — endpoints
- Create: `backend/src/ai/dto/gerar-sugestao.dto.ts`
- Create: `backend/src/ai/dto/aprovar-sugestao.dto.ts`
- Create: `backend/src/ai/dto/rejeitar-sugestao.dto.ts`
- Create: `backend/test/sugestao-ia.e2e-spec.ts`
- Modify: `backend/prisma/schema.prisma` — model `SugestaoIA` + enums `TipoSugestaoIA`/`StatusSugestaoIA`
- Modify: `backend/src/config/configuration.ts` — bloco `ai` + validação
- Modify: `backend/src/prontuario/prontuario.module.ts` — exportar `ProntuarioService`
- Modify: `backend/src/app.module.ts` — registrar `AiModule`
- Modify: `backend/package.json` — deps SDKs
- Modify: `CLAUDE.md` — env vars IA + módulo `ai/`

---

## Task 1: Schema Prisma + migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (após bloco `model DocumentoMedico`/enums, no fim das models clínicas)

- [ ] **Step 1: Adicionar enums + model ao schema**

Em `backend/prisma/schema.prisma`, adicionar após o bloco da model `Evolucao` (linha ~378):

```prisma
enum TipoSugestaoIA {
  RESUMO
  HIPOTESE
  CONDUTA
  ORIENTACOES
}

enum StatusSugestaoIA {
  GERADA
  APROVADA
  REJEITADA
  FALHA
}

model SugestaoIA {
  id                   String           @id @default(uuid()) @db.Uuid
  pacienteId           String           @map("paciente_id") @db.Uuid
  agendamentoId        String?          @map("agendamento_id") @db.Uuid
  evolucaoId           String?          @unique @map("evolucao_id") @db.Uuid
  tipo                 TipoSugestaoIA
  status               StatusSugestaoIA @default(GERADA)
  provider             String?
  modelo               String?
  promptVersao         String?          @map("prompt_versao")
  conteudoGerado       String?          @map("conteudo_gerado")
  conteudoAprovado     String?          @map("conteudo_aprovado")
  tokensPrompt         Int?             @map("tokens_prompt")
  tokensResposta       Int?             @map("tokens_resposta")
  erroMensagem         String?          @map("erro_mensagem")
  autorUsuarioId       String           @map("autor_usuario_id") @db.Uuid
  aprovadoPorUsuarioId String?          @map("aprovado_por_usuario_id") @db.Uuid
  aprovadoEm           DateTime?        @map("aprovado_em")
  createdAt            DateTime         @default(now()) @map("created_at")

  paciente     Paciente  @relation(fields: [pacienteId], references: [id])
  agendamento  Agendamento? @relation(fields: [agendamentoId], references: [id])
  evolucao     Evolucao? @relation(fields: [evolucaoId], references: [id])
  autor        Usuario   @relation("SugestaoAutor", fields: [autorUsuarioId], references: [id])
  aprovadoPor  Usuario?  @relation("SugestaoAprovador", fields: [aprovadoPorUsuarioId], references: [id])

  @@index([pacienteId, createdAt])
  @@index([autorUsuarioId])
  @@map("sugestoes_ia")
}
```

- [ ] **Step 2: Adicionar relações inversas nas models referenciadas**

Em `model Paciente` adicionar campo de relação: `sugestoesIa SugestaoIA[]`
Em `model Agendamento` adicionar: `sugestoesIa SugestaoIA[]`
Em `model Evolucao` adicionar: `sugestaoIa SugestaoIA?`
Em `model Usuario` adicionar duas relações nomeadas:
```prisma
  sugestoesIaAutor     SugestaoIA[] @relation("SugestaoAutor")
  sugestoesIaAprovadas SugestaoIA[] @relation("SugestaoAprovador")
```

- [ ] **Step 3: Criar migration**

Run: `npm --workspace backend run prisma:migrate -- --name ia_sugestoes`
Expected: migration `<timestamp>_ia_sugestoes` criada, tabela `sugestoes_ia` no banco, client regenerado. Sem erro de validação de schema.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma
git commit -m "feat(ia): schema SugestaoIA + enums + migration"
```

---

## Task 2: Config + instalar SDKs

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config/configuration.ts`

- [ ] **Step 1: Instalar SDKs**

Run: `npm --workspace backend install @anthropic-ai/sdk openai`
Expected: deps adicionadas em `backend/package.json`, sem erro.

- [ ] **Step 2: Adicionar bloco `ai` no configuration.ts**

Em `backend/src/config/configuration.ts`, dentro do objeto retornado (após o bloco `whatsapp`), adicionar:

```typescript
  ai: {
    enabled: (process.env.AI_ENABLED ?? 'true').toLowerCase() === 'true',
    providerDefault: (process.env.AI_PROVIDER_DEFAULT ?? 'anthropic').toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '1024', 10),
  },
```

(Nenhuma var de IA é obrigatória em `validateEnv` — IA é opcional e degradável.)

- [ ] **Step 3: Verificar build TS**

Run: `npm --workspace backend run build`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/configuration.ts
git commit -m "feat(ia): config env vars + SDKs anthropic/openai"
```

---

## Task 3: Interface AiProvider + StubProvider (TDD)

**Files:**
- Create: `backend/src/ai/providers/ai-provider.interface.ts`
- Create: `backend/src/ai/providers/stub.provider.ts`
- Test: `backend/src/ai/providers/stub.provider.spec.ts`

- [ ] **Step 1: Escrever interface + tipos**

`backend/src/ai/providers/ai-provider.interface.ts`:

```typescript
export interface AiRequest {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface AiResult {
  conteudo: string;
  modelo: string;
  tokensPrompt: number | null;
  tokensResposta: number | null;
}

export interface AiProvider {
  readonly nome: string; // 'anthropic' | 'openai' | 'stub'
  gerar(req: AiRequest): Promise<AiResult>;
}

// Tokens de injeção (multi-provider)
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
```

- [ ] **Step 2: Escrever teste falho do StubProvider**

`backend/src/ai/providers/stub.provider.spec.ts`:

```typescript
import { StubProvider } from './stub.provider';

describe('StubProvider', () => {
  const provider = new StubProvider();

  it('tem nome stub', () => {
    expect(provider.nome).toBe('stub');
  });

  it('retorna conteúdo determinístico contendo trecho do user', async () => {
    const res = await provider.gerar({
      system: 'sys',
      user: 'queixa: dor de cabeça',
      maxTokens: 1024,
      timeoutMs: 60000,
    });
    expect(res.conteudo).toContain('[SUGESTÃO IA - STUB]');
    expect(res.conteudo).toContain('dor de cabeça');
    expect(res.modelo).toBe('stub-1');
    expect(res.tokensPrompt).toBeGreaterThan(0);
    expect(res.tokensResposta).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Rodar teste — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=stub.provider`
Expected: FAIL — `Cannot find module './stub.provider'`.

- [ ] **Step 4: Implementar StubProvider**

`backend/src/ai/providers/stub.provider.ts`:

```typescript
import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

/** Provider determinístico para testes e ambiente sem API key. Não faz rede. */
export class StubProvider implements AiProvider {
  readonly nome = 'stub';

  async gerar(req: AiRequest): Promise<AiResult> {
    const conteudo = `[SUGESTÃO IA - STUB]\n${req.user.slice(0, 500)}`;
    return {
      conteudo,
      modelo: 'stub-1',
      tokensPrompt: Math.ceil((req.system.length + req.user.length) / 4),
      tokensResposta: Math.ceil(conteudo.length / 4),
    };
  }
}
```

- [ ] **Step 5: Rodar teste — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=stub.provider`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/providers/ai-provider.interface.ts backend/src/ai/providers/stub.provider.ts backend/src/ai/providers/stub.provider.spec.ts
git commit -m "feat(ia): interface AiProvider + StubProvider"
```

---

## Task 4: AiGatewayService — orquestração (TDD)

**Files:**
- Create: `backend/src/ai/ai-gateway.service.ts`
- Test: `backend/src/ai/ai-gateway.service.spec.ts`

Erro tipado para IA indisponível:

- [ ] **Step 1: Escrever teste falho do gateway**

`backend/src/ai/ai-gateway.service.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import { AiGatewayService, AiIndisponivelError } from './ai-gateway.service';
import { AiProvider, AiResult } from './providers/ai-provider.interface';

function fakeProvider(nome: string, impl: () => Promise<AiResult>): AiProvider {
  return { nome, gerar: jest.fn(impl) };
}

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const base = {
    'ai.enabled': true,
    'ai.providerDefault': 'anthropic',
    'ai.maxTokens': 1024,
    'ai.timeoutMs': 60000,
    ...overrides,
  };
  return { get: (k: string) => base[k] } as unknown as ConfigService;
}

const ok = (nome: string): AiResult => ({
  conteudo: `resp-${nome}`,
  modelo: `${nome}-model`,
  tokensPrompt: 10,
  tokensResposta: 20,
});

describe('AiGatewayService', () => {
  it('usa provider default quando responde', async () => {
    const anthropic = fakeProvider('anthropic', async () => ok('anthropic'));
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(res.provider).toBe('anthropic');
    expect(res.conteudo).toBe('resp-anthropic');
  });

  it('faz retry 1x no default antes de fallback', async () => {
    let calls = 0;
    const anthropic = fakeProvider('anthropic', async () => {
      calls++;
      if (calls === 1) throw new Error('timeout');
      return ok('anthropic');
    });
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(calls).toBe(2);
    expect(res.provider).toBe('anthropic');
    expect(openai.gerar).not.toHaveBeenCalled();
  });

  it('faz fallback ao outro provider quando default falha sempre', async () => {
    const anthropic = fakeProvider('anthropic', async () => {
      throw new Error('down');
    });
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(res.provider).toBe('openai');
  });

  it('lança AiIndisponivelError quando todos falham', async () => {
    const anthropic = fakeProvider('anthropic', async () => {
      throw new Error('down');
    });
    const openai = fakeProvider('openai', async () => {
      throw new Error('down');
    });
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
  });

  it('lança AiIndisponivelError quando resposta vem vazia', async () => {
    const anthropic = fakeProvider('anthropic', async () => ({
      conteudo: '   ',
      modelo: 'm',
      tokensPrompt: 1,
      tokensResposta: 0,
    }));
    const openai = fakeProvider('openai', async () => ({
      conteudo: '',
      modelo: 'm',
      tokensPrompt: 1,
      tokensResposta: 0,
    }));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
  });

  it('lança AiIndisponivelError quando AI_ENABLED=false', async () => {
    const anthropic = fakeProvider('anthropic', async () => ok('anthropic'));
    const svc = new AiGatewayService(config({ 'ai.enabled': false }), [
      anthropic,
    ]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
    expect(anthropic.gerar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=ai-gateway`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar AiGatewayService**

`backend/src/ai/ai-gateway.service.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDERS,
  AiProvider,
} from './providers/ai-provider.interface';

export class AiIndisponivelError extends Error {
  constructor(message = 'IA indisponível') {
    super(message);
    this.name = 'AiIndisponivelError';
  }
}

export interface GatewayRequest {
  system: string;
  user: string;
}

export interface GatewayResult {
  provider: string;
  modelo: string;
  conteudo: string;
  tokensPrompt: number | null;
  tokensResposta: number | null;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(AI_PROVIDERS) private readonly providers: AiProvider[],
  ) {}

  /** Ordena providers: default primeiro, demais como fallback. */
  private ordenar(): AiProvider[] {
    const def = this.config.get<string>('ai.providerDefault');
    const sorted = [...this.providers].sort((a, b) => {
      if (a.nome === def) return -1;
      if (b.nome === def) return 1;
      return 0;
    });
    return sorted;
  }

  async gerar(req: GatewayRequest): Promise<GatewayResult> {
    if (!this.config.get<boolean>('ai.enabled')) {
      throw new AiIndisponivelError('IA desabilitada (AI_ENABLED=false)');
    }
    const maxTokens = this.config.get<number>('ai.maxTokens') ?? 1024;
    const timeoutMs = this.config.get<number>('ai.timeoutMs') ?? 60000;
    const providers = this.ordenar();

    for (const provider of providers) {
      // retry 1x no mesmo provider antes de cair pro próximo
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
          const res = await provider.gerar({
            system: req.system,
            user: req.user,
            maxTokens,
            timeoutMs,
          });
          if (!res.conteudo || res.conteudo.trim().length === 0) {
            throw new Error('resposta vazia');
          }
          return {
            provider: provider.nome,
            modelo: res.modelo,
            conteudo: res.conteudo,
            tokensPrompt: res.tokensPrompt,
            tokensResposta: res.tokensResposta,
          };
        } catch (err) {
          this.logger.warn(
            `provider=${provider.nome} tentativa=${tentativa} falhou: ${
              (err as Error).message
            }`,
          );
        }
      }
    }
    throw new AiIndisponivelError('Nenhum provider de IA respondeu');
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=ai-gateway`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai-gateway.service.ts backend/src/ai/ai-gateway.service.spec.ts
git commit -m "feat(ia): AiGatewayService com retry 1x + fallback + degradacao"
```

---

## Task 5: Adapters Anthropic + OpenAI

**Files:**
- Create: `backend/src/ai/providers/anthropic.provider.ts`
- Create: `backend/src/ai/providers/openai.provider.ts`

São adapters finos sobre SDKs externos; cobertos indiretamente via gateway (mock) e e2e (stub). Sem unit test dedicado de rede.

- [ ] **Step 1: Implementar AnthropicProvider**

`backend/src/ai/providers/anthropic.provider.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

export class AnthropicProvider implements AiProvider {
  readonly nome = 'anthropic';
  private readonly client: Anthropic;
  private readonly modelo: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.get<string>('ai.anthropicApiKey') ?? '',
    });
    this.modelo = config.get<string>('ai.anthropicModel') ?? 'claude-opus-4-7';
  }

  async gerar(req: AiRequest): Promise<AiResult> {
    const resp = await this.client.messages.create(
      {
        model: this.modelo,
        max_tokens: req.maxTokens,
        // prompt caching no system para reduzir custo em chamadas repetidas
        system: [
          { type: 'text', text: req.system, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: req.user }],
      },
      { timeout: req.timeoutMs },
    );
    const conteudo = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return {
      conteudo,
      modelo: resp.model,
      tokensPrompt: resp.usage?.input_tokens ?? null,
      tokensResposta: resp.usage?.output_tokens ?? null,
    };
  }
}
```

- [ ] **Step 2: Implementar OpenAiProvider**

`backend/src/ai/providers/openai.provider.ts`:

```typescript
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

export class OpenAiProvider implements AiProvider {
  readonly nome = 'openai';
  private readonly client: OpenAI;
  private readonly modelo: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get<string>('ai.openaiApiKey') ?? '',
    });
    this.modelo = config.get<string>('ai.openaiModel') ?? 'gpt-4o';
  }

  async gerar(req: AiRequest): Promise<AiResult> {
    const resp = await this.client.chat.completions.create(
      {
        model: this.modelo,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      { timeout: req.timeoutMs },
    );
    const conteudo = resp.choices[0]?.message?.content ?? '';
    return {
      conteudo,
      modelo: resp.model,
      tokensPrompt: resp.usage?.prompt_tokens ?? null,
      tokensResposta: resp.usage?.completion_tokens ?? null,
    };
  }
}
```

- [ ] **Step 3: Verificar build TS**

Run: `npm --workspace backend run build`
Expected: compila sem erro (tipos dos SDKs resolvem).

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/providers/anthropic.provider.ts backend/src/ai/providers/openai.provider.ts
git commit -m "feat(ia): adapters Anthropic (prompt caching) e OpenAI"
```

---

## Task 6: Prompts versionados

**Files:**
- Create: `backend/src/ai/prompts/index.ts`

- [ ] **Step 1: Implementar registry de prompts**

`backend/src/ai/prompts/index.ts`:

```typescript
import { TipoSugestaoIA } from '@prisma/client';

export interface ContextoClinico {
  pacienteNome: string;
  pacienteSexo: string;
  pacienteNascimento: string; // ISO date
  evolucoes: Array<{
    queixaPrincipal: string | null;
    subjetivo: string;
    objetivo: string;
    avaliacao: string;
    plano: string;
    createdAt: string;
  }>;
}

export interface PromptTemplate {
  versao: string;
  system: string;
  montarUser(ctx: ContextoClinico): string;
}

const INSTRUCAO_COMUM =
  'Você é assistente clínico de apoio. Suas respostas são SUGESTÕES não vinculantes ' +
  'que SEMPRE serão revisadas e aprovadas por um médico. Nunca afirme diagnóstico ' +
  'definitivo. Seja conciso e objetivo. Responda em português do Brasil.';

function historico(ctx: ContextoClinico): string {
  if (ctx.evolucoes.length === 0) return 'Sem evoluções registradas.';
  return ctx.evolucoes
    .map(
      (e, i) =>
        `Evolução ${i + 1} (${e.createdAt}):\n` +
        `Queixa: ${e.queixaPrincipal ?? '-'}\nS: ${e.subjetivo}\n` +
        `O: ${e.objetivo}\nA: ${e.avaliacao}\nP: ${e.plano}`,
    )
    .join('\n\n');
}

function cabecalho(ctx: ContextoClinico): string {
  return (
    `Paciente: ${ctx.pacienteNome} | Sexo: ${ctx.pacienteSexo} | ` +
    `Nascimento: ${ctx.pacienteNascimento}\n\nHistórico clínico:\n${historico(ctx)}`
  );
}

export const PROMPTS: Record<TipoSugestaoIA, PromptTemplate> = {
  RESUMO: {
    versao: 'resumo@v1',
    system: `${INSTRUCAO_COMUM} Tarefa: resumir o histórico clínico do paciente em até 8 linhas.`,
    montarUser: (ctx) => `${cabecalho(ctx)}\n\nResuma o caso.`,
  },
  HIPOTESE: {
    versao: 'hipotese@v1',
    system: `${INSTRUCAO_COMUM} Tarefa: listar hipóteses diagnósticas plausíveis, da mais à menos provável, com breve justificativa.`,
    montarUser: (ctx) => `${cabecalho(ctx)}\n\nProponha hipóteses diagnósticas.`,
  },
  CONDUTA: {
    versao: 'conduta@v1',
    system: `${INSTRUCAO_COMUM} Tarefa: sugerir conduta/plano terapêutico inicial. Deixe claro que exige validação médica.`,
    montarUser: (ctx) => `${cabecalho(ctx)}\n\nSugira conduta inicial.`,
  },
  ORIENTACOES: {
    versao: 'orientacoes@v1',
    system: `${INSTRUCAO_COMUM} Tarefa: redigir orientações ao paciente em linguagem simples e acolhedora.`,
    montarUser: (ctx) => `${cabecalho(ctx)}\n\nEscreva orientações para o paciente.`,
  },
};
```

- [ ] **Step 2: Verificar build**

Run: `npm --workspace backend run build`
Expected: compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ai/prompts/index.ts
git commit -m "feat(ia): prompts versionados por tipo de sugestao"
```

---

## Task 7: SugestaoIaService — gerar (TDD)

**Files:**
- Create: `backend/src/ai/dto/gerar-sugestao.dto.ts`
- Create: `backend/src/ai/sugestao-ia.service.ts`
- Test: `backend/src/ai/sugestao-ia.service.spec.ts`

- [ ] **Step 1: Escrever DTO de geração**

`backend/src/ai/dto/gerar-sugestao.dto.ts`:

```typescript
import { TipoSugestaoIA } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class GerarSugestaoDto {
  @IsEnum(TipoSugestaoIA)
  tipo!: TipoSugestaoIA;

  @IsOptional()
  @IsUUID()
  agendamentoId?: string;
}
```

- [ ] **Step 2: Escrever teste falho de geração**

`backend/src/ai/sugestao-ia.service.spec.ts`:

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TipoSugestaoIA } from '@prisma/client';
import { SugestaoIaService } from './sugestao-ia.service';
import { AiIndisponivelError } from './ai-gateway.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const medico: AuthUser = { id: 'u-med', perfil: 'MEDICO' } as AuthUser;
const recepcao: AuthUser = { id: 'u-rec', perfil: 'RECEPCAO' } as AuthUser;

function makeService(over: Record<string, unknown> = {}) {
  const prisma = {
    profissional: { findUnique: jest.fn().mockResolvedValue(null) },
    paciente: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        nomeCompleto: 'Fulano',
        sexo: 'M',
        dataNascimento: new Date('1990-01-01'),
        deletedAt: null,
      }),
    },
    prontuario: { findUnique: jest.fn().mockResolvedValue({ id: 'pr1' }) },
    evolucao: { findMany: jest.fn().mockResolvedValue([]) },
    sugestaoIA: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 's1', ...data })),
    },
    ...over,
  };
  const gateway = {
    gerar: jest.fn().mockResolvedValue({
      provider: 'stub',
      modelo: 'stub-1',
      conteudo: 'sugestao gerada',
      tokensPrompt: 5,
      tokensResposta: 9,
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const prontuario = { criarEvolucao: jest.fn() };
  const svc = new SugestaoIaService(
    prisma as never,
    gateway as never,
    audit as never,
    prontuario as never,
  );
  return { svc, prisma, gateway, audit };
}

describe('SugestaoIaService.gerar', () => {
  it('recepção é proibida (403) e audita NEGADO', async () => {
    const { svc, audit } = makeService();
    await expect(
      svc.gerar('p1', { tipo: TipoSugestaoIA.RESUMO }, recepcao, 'ip', 't'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: 'NEGADO' }),
    );
  });

  it('paciente inexistente → 404', async () => {
    const { svc } = makeService({
      paciente: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.gerar('pX', { tipo: TipoSugestaoIA.RESUMO }, medico, 'ip', 't'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('médico gera sugestão GERADA e audita SUCESSO', async () => {
    const { svc, prisma, audit } = makeService();
    const res = await svc.gerar(
      'p1',
      { tipo: TipoSugestaoIA.RESUMO },
      medico,
      'ip',
      't',
    );
    expect(res.status).toBe('GERADA');
    expect(res.provider).toBe('stub');
    expect(res.conteudoGerado).toBe('sugestao gerada');
    expect(prisma.sugestaoIA.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'GERACAO_SUGESTAO_IA', resultado: 'SUCESSO' }),
    );
  });

  it('IA indisponível → persiste FALHA e retorna sem lançar', async () => {
    const { svc, prisma } = makeService();
    const svcAny = svc as unknown as { gateway: { gerar: jest.Mock } };
    svcAny.gateway.gerar = jest
      .fn()
      .mockRejectedValue(new AiIndisponivelError());
    const res = await svc.gerar(
      'p1',
      { tipo: TipoSugestaoIA.RESUMO },
      medico,
      'ip',
      't',
    );
    expect(res.status).toBe('FALHA');
    expect(res.conteudoGerado).toBeNull();
    expect(prisma.sugestaoIA.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FALHA' }),
      }),
    );
  });
});
```

- [ ] **Step 3: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar SugestaoIaService (parte gerar)**

`backend/src/ai/sugestao-ia.service.ts`:

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, Prisma, TipoSugestaoIA } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProntuarioService } from '../prontuario/prontuario.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { AiGatewayService } from './ai-gateway.service';
import { GerarSugestaoDto } from './dto/gerar-sugestao.dto';
import { PROMPTS, ContextoClinico } from './prompts';

@Injectable()
export class SugestaoIaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
    private readonly prontuario: ProntuarioService,
  ) {}

  private async ehMedico(user: AuthUser): Promise<boolean> {
    const prof = await this.prisma.profissional.findUnique({
      where: { usuarioId: user.id },
      select: { ehMedico: true },
    });
    if (prof) return prof.ehMedico;
    return user.perfil === 'MEDICO';
  }

  private async exigirMedico(
    user: AuthUser,
    acao: string,
    ip: string,
    trace: string,
    registroId: string | null = null,
  ): Promise<void> {
    if (await this.ehMedico(user)) return;
    await this.audit.log({
      usuarioId: user.id,
      acao,
      entidade: 'SugestaoIA',
      registroId,
      ipDispositivo: ip,
      resultado: AuditResultado.NEGADO,
      traceId: trace,
    });
    throw new ForbiddenException({
      code: 'IA_RESTRITA_MEDICO',
      message: 'Apenas médicos podem usar a IA assistiva',
    });
  }

  async gerar(
    pacienteId: string,
    dto: GerarSugestaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    await this.exigirMedico(user, 'GERACAO_SUGESTAO_IA', ip, trace);

    const paciente = await this.prisma.paciente.findUnique({
      where: { id: pacienteId },
    });
    if (!paciente || paciente.deletedAt) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }

    const ctx = await this.montarContexto(pacienteId, paciente);
    const template = PROMPTS[dto.tipo];

    let dados: Prisma.SugestaoIACreateInput;
    try {
      const r = await this.gateway.gerar({
        system: template.system,
        user: template.montarUser(ctx),
      });
      dados = {
        paciente: { connect: { id: pacienteId } },
        ...(dto.agendamentoId
          ? { agendamento: { connect: { id: dto.agendamentoId } } }
          : {}),
        tipo: dto.tipo,
        status: 'GERADA',
        provider: r.provider,
        modelo: r.modelo,
        promptVersao: template.versao,
        conteudoGerado: r.conteudo,
        tokensPrompt: r.tokensPrompt,
        tokensResposta: r.tokensResposta,
        autor: { connect: { id: user.id } },
      };
    } catch (err) {
      dados = {
        paciente: { connect: { id: pacienteId } },
        ...(dto.agendamentoId
          ? { agendamento: { connect: { id: dto.agendamentoId } } }
          : {}),
        tipo: dto.tipo,
        status: 'FALHA',
        promptVersao: template.versao,
        erroMensagem: (err as Error).message,
        autor: { connect: { id: user.id } },
      };
    }

    const sugestao = await this.prisma.sugestaoIA.create({ data: dados });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'GERACAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: sugestao.id,
      ipDispositivo: ip,
      resultado:
        sugestao.status === 'FALHA'
          ? AuditResultado.FALHA
          : AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: {
        tipo: dto.tipo,
        provider: sugestao.provider,
        modelo: sugestao.modelo,
        promptVersao: sugestao.promptVersao,
        tokensPrompt: sugestao.tokensPrompt,
        tokensResposta: sugestao.tokensResposta,
      } as Prisma.InputJsonValue,
    });

    return sugestao;
  }

  private async montarContexto(
    pacienteId: string,
    paciente: { nomeCompleto: string; sexo: string; dataNascimento: Date },
  ): Promise<ContextoClinico> {
    const pront = await this.prisma.prontuario.findUnique({
      where: { pacienteId },
    });
    const evolucoes = pront
      ? await this.prisma.evolucao.findMany({
          where: { prontuarioId: pront.id, replacedBy: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];
    return {
      pacienteNome: paciente.nomeCompleto,
      pacienteSexo: paciente.sexo,
      pacienteNascimento: paciente.dataNascimento.toISOString().slice(0, 10),
      evolucoes: evolucoes.map((e) => ({
        queixaPrincipal: e.queixaPrincipal,
        subjetivo: e.subjetivo,
        objetivo: e.objetivo,
        avaliacao: e.avaliacao,
        plano: e.plano,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}
```

- [ ] **Step 5: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: PASS (4 testes da geração).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/dto/gerar-sugestao.dto.ts backend/src/ai/sugestao-ia.service.ts backend/src/ai/sugestao-ia.service.spec.ts
git commit -m "feat(ia): SugestaoIaService.gerar (RBAC, contexto, degradacao FALHA)"
```

---

## Task 8: SugestaoIaService — listar/obter (TDD)

**Files:**
- Modify: `backend/src/ai/sugestao-ia.service.ts`
- Modify: `backend/src/ai/sugestao-ia.service.spec.ts`

RBAC leitura: médico + admin. Recepção/não-médico → 403.

- [ ] **Step 1: Adicionar testes falhos**

Anexar em `sugestao-ia.service.spec.ts` novo bloco:

```typescript
describe('SugestaoIaService leitura', () => {
  const admin: AuthUser = { id: 'u-adm', perfil: 'ADMIN' } as AuthUser;

  it('listar: recepção 403', async () => {
    const { svc } = makeService();
    await expect(
      svc.listar('p1', { id: 'u-rec', perfil: 'RECEPCAO' } as AuthUser, 'ip', 't'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listar: admin recebe lista', async () => {
    const { svc } = makeService({
      sugestaoIA: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
        create: jest.fn(),
      },
    });
    const res = await svc.listar('p1', admin, 'ip', 't');
    expect(res).toHaveLength(1);
  });

  it('obter: sugestão inexistente → 404', async () => {
    const { svc } = makeService({
      sugestaoIA: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    await expect(svc.obter('sX', admin, 'ip', 't')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: FAIL — `svc.listar`/`svc.obter` não existem.

- [ ] **Step 3: Implementar listar/obter**

Adicionar métodos na classe `SugestaoIaService` (e helper de leitura RBAC):

```typescript
  private isMedicoOuAdmin(user: AuthUser): boolean {
    return user.perfil === 'MEDICO' || user.perfil === 'ADMIN';
  }

  private async exigirLeitura(
    user: AuthUser,
    ip: string,
    trace: string,
  ): Promise<void> {
    if (this.isMedicoOuAdmin(user) || (await this.ehMedico(user))) return;
    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: null,
      ipDispositivo: ip,
      resultado: AuditResultado.NEGADO,
      traceId: trace,
    });
    throw new ForbiddenException({
      code: 'IA_RESTRITA',
      message: 'Sem permissão para ler sugestões de IA',
    });
  }

  async listar(pacienteId: string, user: AuthUser, ip: string, trace: string) {
    await this.exigirLeitura(user, ip, trace);
    const sugestoes = await this.prisma.sugestaoIA.findMany({
      where: { pacienteId },
      orderBy: { createdAt: 'desc' },
    });
    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: null,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId } as Prisma.InputJsonValue,
    });
    return sugestoes;
  }

  async obter(id: string, user: AuthUser, ip: string, trace: string) {
    await this.exigirLeitura(user, ip, trace);
    const sugestao = await this.prisma.sugestaoIA.findUnique({ where: { id } });
    if (!sugestao) {
      throw new NotFoundException({
        code: 'SUGESTAO_NAO_ENCONTRADA',
        message: 'Sugestão não encontrada',
      });
    }
    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: sugestao.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });
    return sugestao;
  }
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/sugestao-ia.service.ts backend/src/ai/sugestao-ia.service.spec.ts
git commit -m "feat(ia): listar/obter sugestoes com RBAC leitura + audit visualizacao"
```

---

## Task 9: SugestaoIaService — aprovar/rejeitar (TDD)

**Files:**
- Create: `backend/src/ai/dto/aprovar-sugestao.dto.ts`
- Create: `backend/src/ai/dto/rejeitar-sugestao.dto.ts`
- Modify: `backend/src/ai/sugestao-ia.service.ts`
- Modify: `backend/src/ai/sugestao-ia.service.spec.ts`

Aprovar cria evolução SOAP via `ProntuarioService.criarEvolucao` (exige agendamentoId + campos SOAP). O médico compõe os campos a partir da sugestão.

- [ ] **Step 1: DTOs**

`backend/src/ai/dto/aprovar-sugestao.dto.ts`:

```typescript
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AprovarSugestaoDto {
  @IsUUID()
  agendamentoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  queixaPrincipal?: string;

  @IsString()
  @MaxLength(5000)
  subjetivo!: string;

  @IsString()
  @MaxLength(5000)
  objetivo!: string;

  @IsString()
  @MaxLength(5000)
  avaliacao!: string;

  @IsString()
  @MaxLength(5000)
  plano!: string;
}
```

`backend/src/ai/dto/rejeitar-sugestao.dto.ts`:

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejeitarSugestaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
```

- [ ] **Step 2: Testes falhos de aprovar/rejeitar**

Anexar em `sugestao-ia.service.spec.ts`:

```typescript
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

describe('SugestaoIaService aprovar/rejeitar', () => {
  const aprovarDto = {
    agendamentoId: 'a1',
    subjetivo: 's',
    objetivo: 'o',
    avaliacao: 'a',
    plano: 'p',
  };

  function comSugestao(status: string) {
    return makeService({
      sugestaoIA: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          pacienteId: 'p1',
          status,
          conteudoGerado: 'x',
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 's1', ...data })),
        create: jest.fn(),
      },
    });
  }

  it('aprovar status FALHA → 422', async () => {
    const { svc } = comSugestao('FALHA');
    await expect(
      svc.aprovar('s1', aprovarDto, medico, 'ip', 't'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('aprovar status já APROVADA → 409', async () => {
    const { svc } = comSugestao('APROVADA');
    await expect(
      svc.aprovar('s1', aprovarDto, medico, 'ip', 't'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('aprovar GERADA cria evolução e marca APROVADA', async () => {
    const { svc } = comSugestao('GERADA');
    const svcAny = svc as unknown as {
      prontuario: { criarEvolucao: jest.Mock };
    };
    svcAny.prontuario.criarEvolucao = jest
      .fn()
      .mockResolvedValue({ id: 'evo1' });
    const res = await svc.aprovar('s1', aprovarDto, medico, 'ip', 't');
    expect(svcAny.prontuario.criarEvolucao).toHaveBeenCalled();
    expect(res.status).toBe('APROVADA');
    expect(res.evolucaoId).toBe('evo1');
  });

  it('rejeitar GERADA marca REJEITADA', async () => {
    const { svc } = comSugestao('GERADA');
    const res = await svc.rejeitar('s1', { motivo: 'ruim' }, medico, 'ip', 't');
    expect(res.status).toBe('REJEITADA');
  });

  it('recepção não aprova (403)', async () => {
    const { svc } = comSugestao('GERADA');
    await expect(
      svc.aprovar('s1', aprovarDto, recepcao, 'ip', 't'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 3: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: FAIL — `svc.aprovar`/`svc.rejeitar` não existem.

- [ ] **Step 4: Implementar aprovar/rejeitar**

Adicionar imports no topo do service:
```typescript
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
```
(somar aos imports `@nestjs/common` já presentes)

Adicionar imports de DTO:
```typescript
import { AprovarSugestaoDto } from './dto/aprovar-sugestao.dto';
import { RejeitarSugestaoDto } from './dto/rejeitar-sugestao.dto';
```

Adicionar métodos na classe:

```typescript
  private async carregarParaDecisao(id: string) {
    const sugestao = await this.prisma.sugestaoIA.findUnique({ where: { id } });
    if (!sugestao) {
      throw new NotFoundException({
        code: 'SUGESTAO_NAO_ENCONTRADA',
        message: 'Sugestão não encontrada',
      });
    }
    if (sugestao.status === 'FALHA') {
      throw new UnprocessableEntityException({
        code: 'SUGESTAO_INVALIDA',
        message: 'Sugestão com falha não pode ser decidida',
      });
    }
    if (sugestao.status !== 'GERADA') {
      throw new ConflictException({
        code: 'SUGESTAO_JA_DECIDIDA',
        message: `Sugestão já está ${sugestao.status}`,
      });
    }
    return sugestao;
  }

  async aprovar(
    id: string,
    dto: AprovarSugestaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    await this.exigirMedico(user, 'APROVACAO_SUGESTAO_IA', ip, trace, id);
    const sugestao = await this.carregarParaDecisao(id);

    const evolucao = await this.prontuario.criarEvolucao(
      sugestao.pacienteId,
      {
        agendamentoId: dto.agendamentoId,
        queixaPrincipal: dto.queixaPrincipal,
        subjetivo: dto.subjetivo,
        objetivo: dto.objetivo,
        avaliacao: dto.avaliacao,
        plano: dto.plano,
      },
      user,
      ip,
      trace,
    );

    const conteudoAprovado = [
      dto.queixaPrincipal && `Queixa: ${dto.queixaPrincipal}`,
      `S: ${dto.subjetivo}`,
      `O: ${dto.objetivo}`,
      `A: ${dto.avaliacao}`,
      `P: ${dto.plano}`,
    ]
      .filter(Boolean)
      .join('\n');

    const atualizada = await this.prisma.sugestaoIA.update({
      where: { id },
      data: {
        status: 'APROVADA',
        conteudoAprovado,
        evolucaoId: evolucao.id,
        aprovadoPorUsuarioId: user.id,
        aprovadoEm: new Date(),
      },
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'APROVACAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { evolucaoId: evolucao.id } as Prisma.InputJsonValue,
    });

    return atualizada;
  }

  async rejeitar(
    id: string,
    dto: RejeitarSugestaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    await this.exigirMedico(user, 'REJEICAO_SUGESTAO_IA', ip, trace, id);
    await this.carregarParaDecisao(id);

    const atualizada = await this.prisma.sugestaoIA.update({
      where: { id },
      data: { status: 'REJEITADA' },
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'REJEICAO_SUGESTAO_IA',
      entidade: 'SugestaoIA',
      registroId: id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { motivo: dto.motivo ?? null } as Prisma.InputJsonValue,
    });

    return atualizada;
  }
```

- [ ] **Step 5: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=sugestao-ia.service`
Expected: PASS (12 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/dto backend/src/ai/sugestao-ia.service.ts backend/src/ai/sugestao-ia.service.spec.ts
git commit -m "feat(ia): aprovar (cria evolucao) e rejeitar com state machine"
```

---

## Task 10: Controller + module wiring

**Files:**
- Create: `backend/src/ai/sugestao-ia.controller.ts`
- Create: `backend/src/ai/ai.module.ts`
- Modify: `backend/src/prontuario/prontuario.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Exportar ProntuarioService**

`backend/src/prontuario/prontuario.module.ts` — adicionar `exports`:

```typescript
import { Module } from '@nestjs/common';
import { ProntuarioController } from './prontuario.controller';
import { ProntuarioService } from './prontuario.service';

@Module({
  controllers: [ProntuarioController],
  providers: [ProntuarioService],
  exports: [ProntuarioService],
})
export class ProntuarioModule {}
```

- [ ] **Step 2: Controller**

`backend/src/ai/sugestao-ia.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { SugestaoIaService } from './sugestao-ia.service';
import { GerarSugestaoDto } from './dto/gerar-sugestao.dto';
import { AprovarSugestaoDto } from './dto/aprovar-sugestao.dto';
import { RejeitarSugestaoDto } from './dto/rejeitar-sugestao.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller()
export class SugestaoIaController {
  constructor(private readonly sugestoes: SugestaoIaService) {}

  private ip(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
  private trace(req: Request): string {
    return (req as unknown as { trace_id?: string }).trace_id ?? 'unknown';
  }

  @Post('pacientes/:pacienteId/ia/sugestoes')
  @Roles(PerfilTipo.MEDICO)
  @HttpCode(HttpStatus.CREATED)
  gerar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @Body() dto: GerarSugestaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sugestoes.gerar(pacienteId, dto, user, this.ip(req), this.trace(req));
  }

  @Get('pacientes/:pacienteId/ia/sugestoes')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.ADMIN)
  listar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sugestoes.listar(pacienteId, user, this.ip(req), this.trace(req));
  }

  @Get('ia/sugestoes/:id')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.ADMIN)
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sugestoes.obter(id, user, this.ip(req), this.trace(req));
  }

  @Post('ia/sugestoes/:id/aprovar')
  @Roles(PerfilTipo.MEDICO)
  aprovar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AprovarSugestaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sugestoes.aprovar(id, dto, user, this.ip(req), this.trace(req));
  }

  @Post('ia/sugestoes/:id/rejeitar')
  @Roles(PerfilTipo.MEDICO)
  rejeitar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejeitarSugestaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sugestoes.rejeitar(id, dto, user, this.ip(req), this.trace(req));
  }
}
```

- [ ] **Step 3: Module com factory multi-provider**

`backend/src/ai/ai.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { ProntuarioModule } from '../prontuario/prontuario.module';
import { AiGatewayService } from './ai-gateway.service';
import { SugestaoIaService } from './sugestao-ia.service';
import { SugestaoIaController } from './sugestao-ia.controller';
import { AI_PROVIDERS, AiProvider } from './providers/ai-provider.interface';
import { StubProvider } from './providers/stub.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [AuditModule, ProntuarioModule],
  controllers: [SugestaoIaController],
  providers: [
    AiGatewayService,
    SugestaoIaService,
    {
      provide: AI_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider[] => {
        // Em teste, ou sem nenhuma key → só stub (sem rede).
        const isTest = config.get<string>('nodeEnv') === 'test';
        const anthropicKey = config.get<string>('ai.anthropicApiKey');
        const openaiKey = config.get<string>('ai.openaiApiKey');
        if (isTest || (!anthropicKey && !openaiKey)) {
          return [new StubProvider()];
        }
        const list: AiProvider[] = [];
        if (anthropicKey) list.push(new AnthropicProvider(config));
        if (openaiKey) list.push(new OpenAiProvider(config));
        list.push(new StubProvider()); // fallback final sempre disponível
        return list;
      },
    },
  ],
})
export class AiModule {}
```

- [ ] **Step 4: Registrar no app.module**

`backend/src/app.module.ts` — adicionar `AiModule` ao array de `imports`, após `DocumentosModule`:

```typescript
    DocumentosModule,
    AiModule,
```
E o import no topo:
```typescript
import { AiModule } from './ai/ai.module';
```

- [ ] **Step 5: Build + unit completo**

Run: `npm --workspace backend run build`
Expected: compila sem erro.
Run: `npm --workspace backend test`
Expected: PASS — todos os unit (incluindo os novos de IA) verdes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/sugestao-ia.controller.ts backend/src/ai/ai.module.ts backend/src/prontuario/prontuario.module.ts backend/src/app.module.ts
git commit -m "feat(ia): controller + AiModule (factory multi-provider) + wiring"
```

---

## Task 11: Testes e2e

**Files:**
- Create: `backend/test/sugestao-ia.e2e-spec.ts`

Reusar helpers de e2e existentes. Inspecionar um e2e atual (ex.: `backend/test/prontuario.e2e-spec.ts`) para o padrão de bootstrap/login/seed antes de escrever. Ambiente de teste usa StubProvider (sempre responde), então geração sempre cria status GERADA.

- [ ] **Step 1: Escrever e2e**

`backend/test/sugestao-ia.e2e-spec.ts` — seguir o mesmo scaffolding de `prontuario.e2e-spec.ts` (criar app, migrar/seed, obter tokens por perfil, criar paciente + profissional médico vinculado + agendamento). Cobrir:

```typescript
// Pseudo-estrutura — preencher com os helpers reais do projeto observados em prontuario.e2e-spec.ts
describe('Sugestão IA (e2e)', () => {
  it('médico gera sugestão → 201 status GERADA', async () => {
    // POST /api/pacientes/:id/ia/sugestoes { tipo: 'RESUMO' }
    // espera 201, body.data.status === 'GERADA', provider === 'stub'
  });

  it('médico aprova → cria evolução e marca APROVADA', async () => {
    // gera sugestão, depois
    // POST /api/ia/sugestoes/:id/aprovar { agendamentoId, subjetivo, objetivo, avaliacao, plano }
    // espera 200/201, status APROVADA, evolucaoId preenchido
    // GET prontuário do paciente mostra a nova evolução
  });

  it('aprovar duas vezes → 409', async () => {
    // segunda aprovação da mesma sugestão → 409 SUGESTAO_JA_DECIDIDA
  });

  it('recepção tenta gerar → 403', async () => {
    // token recepção, POST gerar → 403
  });

  it('admin lista sugestões → 200', async () => {
    // token admin, GET lista → 200
  });

  it('sugestão inexistente → 404', async () => {
    // GET /api/ia/sugestoes/<uuid aleatório> → 404
  });
});
```

Preencher cada caso com requests reais via `supertest` (`request(app.getHttpServer())`), seguindo exatamente o padrão de autenticação/headers/envelope (`res.body.data`, `res.body.success`) usado em `prontuario.e2e-spec.ts`.

- [ ] **Step 2: Rodar e2e (serial)**

Run: `npm --workspace backend run test:e2e -- --runInBand --testPathPattern=sugestao-ia`
Expected: PASS — todos os casos verdes. (`--runInBand` obrigatório: e2e paralelo causa contenção de DB.)

- [ ] **Step 3: Commit**

```bash
git add backend/test/sugestao-ia.e2e-spec.ts
git commit -m "test(ia): e2e fluxo gerar/aprovar/rejeitar + RBAC + 404"
```

---

## Task 12: Docs + verificação final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar env vars + módulo**

Em `CLAUDE.md`, seção "Variáveis de ambiente obrigatórias (backend)", adicionar ao bloco de opcionais:
`AI_ENABLED=true`, `AI_PROVIDER_DEFAULT=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-opus-4-7`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o`, `AI_TIMEOUT_MS=60000`, `AI_MAX_TOKENS=1024`.

Na seção "Arquitetura → Backend", adicionar bullet do módulo:
`- ai/ — IA assistiva (Fase 2). AiGatewayService multi-provider (Anthropic+OpenAI+stub) com retry 1x + fallback. SugestaoIA: médico gera/aprova/rejeita; aprovar cria evolução via ProntuarioService. Prompts versionados. Falha não bloqueia atendimento.`

- [ ] **Step 2: Lint + suíte completa**

Run: `npm --workspace backend run lint`
Expected: 0 erros.
Run: `npm --workspace backend test`
Expected: todos unit verdes.
Run: `npm --workspace backend run test:e2e -- --runInBand`
Expected: todos e2e verdes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(ia): env vars + modulo ai no CLAUDE.md"
```

- [ ] **Step 4: QA antes do merge**

Invocar agente `qa-auditoria` para validar a feature (sucesso/erro/permissão por endpoint, DoD, logs/auditoria, schema/status codes) antes de mergear na main.

---

## Notas de execução

- **e2e serial obrigatório** (`--runInBand`) — documentado nos sub-projetos anteriores.
- **Sem API key real em teste** — factory do módulo cai pro StubProvider quando `nodeEnv=test`.
- **CRLF/EOL**: repo tem `core.autocrlf=true`; `eslint --fix` normaliza no disco. Não adicionar `.gitattributes` aqui (ver TD-DOC-7).
- **LGPD pendente** (operacional, fora do código): registrar DPA/consentimento com Anthropic/OpenAI antes de ligar provider real em produção. Em homolog, deixar `AI_ENABLED` controlado e sem key real até aprovação.
