# Prontuário base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API backend de prontuário eletrônico estruturado (evoluções SOAP vinculadas a agendamento), append-only com retificação versionada, RBAC clínico e auditoria inclusive de visualização.

**Architecture:** Novo módulo NestJS `backend/src/prontuario/` (controller + service + DTOs), 2 modelos Prisma novos (`Prontuario` 1:1 paciente, `Evolucao` imutável com cadeia de versão via `replacesId`). Reusa `PrismaService`, `AuditService`, decorators `@Roles`/`@CurrentUser`, envelope global.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest (unit), Supertest (e2e), class-validator.

Spec: [docs/superpowers/specs/2026-05-22-prontuario-base-design.md](../specs/2026-05-22-prontuario-base-design.md)

---

## File Structure

- `backend/prisma/schema.prisma` — modificar: + models `Prontuario`, `Evolucao`; relações inversas em `Paciente`, `Agendamento`, `Usuario`.
- `backend/src/prontuario/prontuario.module.ts` — criar: módulo.
- `backend/src/prontuario/prontuario.service.ts` — criar: regras, RBAC de leitura, transações, audit.
- `backend/src/prontuario/prontuario.controller.ts` — criar: rotas, `@Roles`, ip/trace.
- `backend/src/prontuario/dto/criar-evolucao.dto.ts` — criar.
- `backend/src/prontuario/dto/retificar-evolucao.dto.ts` — criar.
- `backend/src/prontuario/prontuario.service.spec.ts` — criar: unit.
- `backend/test/prontuario.e2e-spec.ts` — criar: e2e.
- `backend/src/app.module.ts` — modificar: importar `ProntuarioModule`.

**Convenções de assinatura (consistência entre tasks):**
- `AuthUser = { id: string; email: string; perfil: string }` (já existe em `common/decorators/current-user.decorator.ts`).
- Métodos do service recebem `(…, user: AuthUser, ip: string, trace: string)`.
- Ações de auditoria: `VISUALIZACAO_PRONTUARIO`, `VISUALIZACAO_EVOLUCAO`, `CRIACAO_EVOLUCAO`, `RETIFICACAO_EVOLUCAO`.

---

### Task 1: Schema Prisma + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Adicionar models e relações inversas**

No `schema.prisma`, adicionar os models:

```prisma
model Prontuario {
  id         String     @id @default(uuid()) @db.Uuid
  pacienteId String     @unique @map("paciente_id") @db.Uuid
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")
  paciente   Paciente   @relation(fields: [pacienteId], references: [id])
  evolucoes  Evolucao[]

  @@map("prontuarios")
}

model Evolucao {
  id              String      @id @default(uuid()) @db.Uuid
  prontuarioId    String      @map("prontuario_id") @db.Uuid
  agendamentoId   String      @map("agendamento_id") @db.Uuid
  autorUsuarioId  String      @map("autor_usuario_id") @db.Uuid
  autorEhMedico   Boolean     @map("autor_eh_medico")
  queixaPrincipal String?     @map("queixa_principal")
  subjetivo       String
  objetivo        String
  avaliacao       String
  plano           String
  versao          Int         @default(1)
  replacesId      String?     @unique @map("replaces_id") @db.Uuid
  createdAt       DateTime    @default(now()) @map("created_at")

  prontuario  Prontuario  @relation(fields: [prontuarioId], references: [id])
  agendamento Agendamento @relation(fields: [agendamentoId], references: [id])
  autor       Usuario     @relation(fields: [autorUsuarioId], references: [id])
  replaces    Evolucao?   @relation("Retificacao", fields: [replacesId], references: [id])
  replacedBy  Evolucao?   @relation("Retificacao")

  @@index([prontuarioId, createdAt])
  @@index([autorUsuarioId])
  @@map("evolucoes")
}
```

Adicionar relações inversas nos models existentes:
- Em `Paciente { … }`: `prontuario Prontuario?`
- Em `Agendamento { … }`: `evolucoes Evolucao[]`
- Em `Usuario { … }`: `evolucoes Evolucao[]`

- [ ] **Step 2: Gerar migration**

Run: `npm --workspace backend run dev:db` (se DB não estiver rodando) e depois
`npm --workspace backend exec prisma migrate dev --name prontuario_base`
Expected: migration criada em `backend/prisma/migrations/*_prontuario_base/`, client regenerado, sem erro.

- [ ] **Step 3: Verificar compilação do client**

Run: `npm --workspace backend exec tsc --noEmit`
Expected: 0 erros (tipos `Prontuario`/`Evolucao` disponíveis em `@prisma/client`).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(prontuario): schema Prontuario + Evolucao (append-only, versao)"
```

---

### Task 2: DTOs

**Files:**
- Create: `backend/src/prontuario/dto/criar-evolucao.dto.ts`
- Create: `backend/src/prontuario/dto/retificar-evolucao.dto.ts`

- [ ] **Step 1: criar-evolucao.dto.ts**

```typescript
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CriarEvolucaoDto {
  @IsUUID()
  agendamentoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  queixaPrincipal?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  subjetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  objetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  avaliacao!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  plano!: string;
}
```

- [ ] **Step 2: retificar-evolucao.dto.ts**

```typescript
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RetificarEvolucaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  queixaPrincipal?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  subjetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  objetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  avaliacao!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  plano!: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/prontuario/dto
git commit -m "feat(prontuario): DTOs criar/retificar evolucao"
```

---

### Task 3: ProntuarioService.criarEvolucao (TDD)

**Files:**
- Create: `backend/src/prontuario/prontuario.service.ts`
- Test: `backend/src/prontuario/prontuario.service.spec.ts`

- [ ] **Step 1: Escrever teste que falha**

Criar `prontuario.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditResultado, PerfilTipo } from '@prisma/client';
import { ProntuarioService } from './prontuario.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PAC = '22222222-2222-4222-8222-222222222222';
const AG = '33333333-3333-4333-8333-333333333333';
const PRONT = '44444444-4444-4444-8444-444444444444';
const EVO = '55555555-5555-4555-8555-555555555555';
const MEDICO = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'm@x', perfil: 'MEDICO' };
const NAOMED = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'n@x', perfil: 'PROFISSIONAL_NAO_MEDICO' };

function makePrisma() {
  const tx = {
    prontuario: { findUnique: jest.fn(), create: jest.fn() },
    evolucao: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    auditoria: { create: jest.fn() },
  };
  return {
    ...tx,
    agendamento: { findUnique: jest.fn() },
    profissional: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
}
function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('ProntuarioService', () => {
  let service: ProntuarioService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(async () => {
    prisma = makePrisma();
    audit = makeAudit();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProntuarioService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(ProntuarioService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('criarEvolucao', () => {
    it('cria evolução vinculada ao agendamento do paciente, autor=usuário, audita', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: PAC });
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.create.mockResolvedValue({ id: EVO, prontuarioId: PRONT, versao: 1 });

      const dto = { agendamentoId: AG, subjetivo: 's', objetivo: 'o', avaliacao: 'a', plano: 'p' };
      const r = await service.criarEvolucao(PAC, dto as any, MEDICO as any, '1.2.3.4', 'trace-1');

      expect(r.id).toBe(EVO);
      expect(prisma.evolucao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prontuarioId: PRONT,
            agendamentoId: AG,
            autorUsuarioId: MEDICO.id,
            autorEhMedico: true,
            versao: 1,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'CRIACAO_EVOLUCAO', resultado: AuditResultado.SUCESSO }),
      );
    });

    it('cria prontuário lazy quando ainda não existe', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: PAC });
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: false });
      prisma.prontuario.findUnique.mockResolvedValue(null);
      prisma.prontuario.create.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.create.mockResolvedValue({ id: EVO, prontuarioId: PRONT, versao: 1 });

      await service.criarEvolucao(PAC, { agendamentoId: AG, subjetivo: 's', objetivo: 'o', avaliacao: 'a', plano: 'p' } as any, NAOMED as any, 'ip', 't');

      expect(prisma.prontuario.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pacienteId: PAC }) }),
      );
    });

    it('rejeita quando agendamento não pertence ao paciente (400)', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: 'outro' });
      await expect(
        service.criarEvolucao(PAC, { agendamentoId: AG, subjetivo: 's', objetivo: 'o', avaliacao: 'a', plano: 'p' } as any, MEDICO as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.evolucao.create).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: FAIL — `Cannot find module './prontuario.service'`.

- [ ] **Step 3: Implementar ProntuarioService (mínimo p/ passar)**

Criar `prontuario.service.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CriarEvolucaoDto } from './dto/criar-evolucao.dto';

@Injectable()
export class ProntuarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ehMedico(user: AuthUser): Promise<boolean> {
    const prof = await this.prisma.profissional.findUnique({
      where: { usuarioId: user.id },
      select: { ehMedico: true },
    });
    if (prof) return prof.ehMedico;
    return user.perfil === 'MEDICO';
  }

  async criarEvolucao(
    pacienteId: string,
    dto: CriarEvolucaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const ag = await this.prisma.agendamento.findUnique({
      where: { id: dto.agendamentoId },
      select: { id: true, pacienteId: true },
    });
    if (!ag || ag.pacienteId !== pacienteId) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_INVALIDO',
        message: 'Agendamento não pertence ao paciente',
      });
    }

    const autorEhMedico = await this.ehMedico(user);

    const evolucao = await this.prisma.$transaction(async (tx) => {
      let pront = await tx.prontuario.findUnique({ where: { pacienteId } });
      if (!pront) {
        pront = await tx.prontuario.create({ data: { pacienteId } });
      }
      return tx.evolucao.create({
        data: {
          prontuarioId: pront.id,
          agendamentoId: dto.agendamentoId,
          autorUsuarioId: user.id,
          autorEhMedico,
          queixaPrincipal: dto.queixaPrincipal,
          subjetivo: dto.subjetivo,
          objetivo: dto.objetivo,
          avaliacao: dto.avaliacao,
          plano: dto.plano,
          versao: 1,
        },
      });
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'CRIACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: evolucao.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId, agendamentoId: dto.agendamentoId } as Prisma.InputJsonValue,
    });

    return evolucao;
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: PASS (3 testes de criarEvolucao).

- [ ] **Step 5: Commit**

```bash
git add backend/src/prontuario/prontuario.service.ts backend/src/prontuario/prontuario.service.spec.ts
git commit -m "feat(prontuario): criarEvolucao com lazy prontuario + audit (TDD)"
```

---

### Task 4: ProntuarioService.listarProntuario (RBAC leitura) (TDD)

**Files:**
- Modify: `backend/src/prontuario/prontuario.service.ts`
- Modify: `backend/src/prontuario/prontuario.service.spec.ts`

- [ ] **Step 1: Escrever testes que falham**

Adicionar no spec, dentro de `describe('ProntuarioService')`:

```typescript
  describe('listarProntuario', () => {
    it('médico vê todas as evoluções atuais e audita visualização', async () => {
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.findMany.mockResolvedValue([{ id: EVO }]);

      const r = await service.listarProntuario(PAC, MEDICO as any, 'ip', 't');

      expect(r.evolucoes).toHaveLength(1);
      // sem filtro de autor para médico
      expect(prisma.evolucao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ prontuarioId: PRONT, replacedBy: null }),
        }),
      );
      const whereArg = prisma.evolucao.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_PRONTUARIO' }),
      );
    });

    it('não-médico só vê as próprias evoluções (filtro autorUsuarioId)', async () => {
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.findMany.mockResolvedValue([]);

      await service.listarProntuario(PAC, NAOMED as any, 'ip', 't');

      const whereArg = prisma.evolucao.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBe(NAOMED.id);
    });

    it('prontuário inexistente: retorna evoluções vazias (não 404)', async () => {
      prisma.prontuario.findUnique.mockResolvedValue(null);
      const r = await service.listarProntuario(PAC, MEDICO as any, 'ip', 't');
      expect(r.evolucoes).toEqual([]);
    });
  });
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: FAIL — `service.listarProntuario is not a function`.

- [ ] **Step 3: Implementar listarProntuario**

Adicionar ao `ProntuarioService`:

```typescript
  private isMedicoOuAdmin(user: AuthUser): boolean {
    return user.perfil === 'MEDICO' || user.perfil === 'ADMIN';
  }

  async listarProntuario(
    pacienteId: string,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const pront = await this.prisma.prontuario.findUnique({
      where: { pacienteId },
    });

    let evolucoes: unknown[] = [];
    if (pront) {
      const where: Prisma.EvolucaoWhereInput = {
        prontuarioId: pront.id,
        replacedBy: null, // apenas versões atuais
      };
      if (!this.isMedicoOuAdmin(user)) {
        where.autorUsuarioId = user.id;
      }
      evolucoes = await this.prisma.evolucao.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_PRONTUARIO',
      entidade: 'Prontuario',
      registroId: pront?.id ?? null,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId } as Prisma.InputJsonValue,
    });

    return { prontuario: pront, evolucoes };
  }
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: PASS (todos, incl. 3 novos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/prontuario/prontuario.service.ts backend/src/prontuario/prontuario.service.spec.ts
git commit -m "feat(prontuario): listarProntuario com RBAC de leitura + audit visualizacao"
```

---

### Task 5: ProntuarioService.obterEvolucao (cadeia de versões + RBAC) (TDD)

**Files:**
- Modify: `backend/src/prontuario/prontuario.service.ts`
- Modify: `backend/src/prontuario/prontuario.service.spec.ts`

- [ ] **Step 1: Escrever testes que falham**

```typescript
  describe('obterEvolucao', () => {
    it('retorna evolução e audita VISUALIZACAO_EVOLUCAO', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({ id: EVO, autorUsuarioId: MEDICO.id });
      const r = await service.obterEvolucao(EVO, MEDICO as any, 'ip', 't');
      expect(r.id).toBe(EVO);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_EVOLUCAO', registroId: EVO }),
      );
    });

    it('não-médico tentando ler evolução de outro: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({ id: EVO, autorUsuarioId: 'outro' });
      await expect(
        service.obterEvolucao(EVO, NAOMED as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('evolução inexistente: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue(null);
      await expect(
        service.obterEvolucao(EVO, MEDICO as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: FAIL — `service.obterEvolucao is not a function`.

- [ ] **Step 3: Implementar obterEvolucao**

```typescript
  async obterEvolucao(
    evolucaoId: string,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const evo = await this.prisma.evolucao.findUnique({
      where: { id: evolucaoId },
      include: { replaces: true, replacedBy: true },
    });
    // não-médico só acessa as próprias → trata como inexistente (404)
    if (!evo || (!this.isMedicoOuAdmin(user) && evo.autorUsuarioId !== user.id)) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NAO_ENCONTRADA',
        message: 'Evolução não encontrada',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: evo.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return evo;
  }
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/prontuario/prontuario.service.ts backend/src/prontuario/prontuario.service.spec.ts
git commit -m "feat(prontuario): obterEvolucao com RBAC + audit visualizacao"
```

---

### Task 6: ProntuarioService.retificar (versão + autor) (TDD)

**Files:**
- Modify: `backend/src/prontuario/prontuario.service.ts`
- Modify: `backend/src/prontuario/prontuario.service.spec.ts`

- [ ] **Step 1: Escrever testes que falham**

```typescript
  describe('retificar', () => {
    const dto = { subjetivo: 's2', objetivo: 'o2', avaliacao: 'a2', plano: 'p2' };

    it('cria nova versão com replacesId e versao+1, audita', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO, prontuarioId: PRONT, agendamentoId: AG,
        autorUsuarioId: MEDICO.id, autorEhMedico: true, versao: 1, replacedBy: null,
      });
      prisma.evolucao.create.mockResolvedValue({ id: 'nova', versao: 2, replacesId: EVO });

      const r = await service.retificar(EVO, dto as any, MEDICO as any, 'ip', 't');

      expect(prisma.evolucao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replacesId: EVO, versao: 2, prontuarioId: PRONT, autorUsuarioId: MEDICO.id }),
        }),
      );
      expect(r.versao).toBe(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'RETIFICACAO_EVOLUCAO' }),
      );
    });

    it('retificar de outro autor: 403', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO, autorUsuarioId: 'outro', versao: 1, replacedBy: null,
      });
      await expect(
        service.retificar(EVO, dto as any, MEDICO as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retificar versão já substituída: 409', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO, autorUsuarioId: MEDICO.id, versao: 1, replacedBy: { id: 'nova' },
      });
      await expect(
        service.retificar(EVO, dto as any, MEDICO as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('evolução inexistente: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue(null);
      await expect(
        service.retificar(EVO, dto as any, MEDICO as any, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

Adicionar imports no topo do spec:
```typescript
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
```
(`BadRequestException` já importado.)

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: FAIL — `service.retificar is not a function`.

- [ ] **Step 3: Implementar retificar**

Adicionar imports no topo do service:
```typescript
import { ConflictException, ForbiddenException } from '@nestjs/common';
```
E o método:
```typescript
  async retificar(
    evolucaoId: string,
    dto: import('./dto/retificar-evolucao.dto').RetificarEvolucaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const orig = await this.prisma.evolucao.findUnique({
      where: { id: evolucaoId },
      include: { replacedBy: true },
    });
    if (!orig) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NAO_ENCONTRADA',
        message: 'Evolução não encontrada',
      });
    }
    if (orig.autorUsuarioId !== user.id) {
      throw new ForbiddenException({
        code: 'NAO_AUTOR',
        message: 'Apenas o autor pode retificar a evolução',
      });
    }
    if (orig.replacedBy) {
      throw new ConflictException({
        code: 'VERSAO_NAO_ATUAL',
        message: 'Esta evolução já foi retificada',
      });
    }

    const nova = await this.prisma.$transaction((tx) =>
      tx.evolucao.create({
        data: {
          prontuarioId: orig.prontuarioId,
          agendamentoId: orig.agendamentoId,
          autorUsuarioId: orig.autorUsuarioId,
          autorEhMedico: orig.autorEhMedico,
          queixaPrincipal: dto.queixaPrincipal,
          subjetivo: dto.subjetivo,
          objetivo: dto.objetivo,
          avaliacao: dto.avaliacao,
          plano: dto.plano,
          versao: orig.versao + 1,
          replacesId: orig.id,
        },
      }),
    );

    await this.audit.log({
      usuarioId: user.id,
      acao: 'RETIFICACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: nova.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { retificaId: orig.id, versao: nova.versao } as Prisma.InputJsonValue,
    });

    return nova;
  }
```
(Importar `RetificarEvolucaoDto` no topo em vez do inline `import(...)` se preferir; o inline mantém o exemplo autossuficiente.)

- [ ] **Step 4: Rodar — deve passar**

Run: `npm --workspace backend test -- --testPathPattern=prontuario.service`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/prontuario/prontuario.service.ts backend/src/prontuario/prontuario.service.spec.ts
git commit -m "feat(prontuario): retificar com versao+autor (403/409) + audit"
```

---

### Task 7: Controller + módulo + wiring

**Files:**
- Create: `backend/src/prontuario/prontuario.controller.ts`
- Create: `backend/src/prontuario/prontuario.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Controller**

Criar `prontuario.controller.ts`:

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
import { ProntuarioService } from './prontuario.service';
import { CriarEvolucaoDto } from './dto/criar-evolucao.dto';
import { RetificarEvolucaoDto } from './dto/retificar-evolucao.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller()
export class ProntuarioController {
  constructor(private readonly prontuario: ProntuarioService) {}

  private ip(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
  private trace(req: Request): string {
    return (req as unknown as { trace_id?: string }).trace_id ?? 'unknown';
  }

  @Get('pacientes/:pacienteId/prontuario')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  listar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.listarProntuario(pacienteId, user, this.ip(req), this.trace(req));
  }

  @Get('evolucoes/:id')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.obterEvolucao(id, user, this.ip(req), this.trace(req));
  }

  @Post('pacientes/:pacienteId/prontuario/evolucoes')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  criar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @Body() dto: CriarEvolucaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.criarEvolucao(pacienteId, dto, user, this.ip(req), this.trace(req));
  }

  @Post('evolucoes/:id/retificar')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  retificar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RetificarEvolucaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.retificar(id, dto, user, this.ip(req), this.trace(req));
  }
}
```

> Nota: ADMIN só está em `@Roles` nas rotas GET; nas rotas POST a ausência de ADMIN faz o `RolesGuard` retornar 403 (admin não cria/retifica), conforme spec.

- [ ] **Step 2: Module**

Criar `prontuario.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProntuarioController } from './prontuario.controller';
import { ProntuarioService } from './prontuario.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ProntuarioController],
  providers: [ProntuarioService],
})
export class ProntuarioModule {}
```
(Se `AuditModule` não exportar `AuditService` ou não existir como módulo isolado, seguir o mesmo padrão de import usado por `pacientes.module.ts` — verificar e replicar.)

- [ ] **Step 3: Wiring no AppModule**

Em `backend/src/app.module.ts`, importar `ProntuarioModule` e adicionar ao array `imports`:
```typescript
import { ProntuarioModule } from './prontuario/prontuario.module';
// ... imports: [ ..., ProntuarioModule ]
```

- [ ] **Step 4: Verificar boot + lint**

Run: `npm --workspace backend exec tsc --noEmit` → Expected: 0 erros.
Run: `npm --workspace backend run lint` → Expected: 0 erros (warnings pré-existentes ok).

- [ ] **Step 5: Commit**

```bash
git add backend/src/prontuario/prontuario.controller.ts backend/src/prontuario/prontuario.module.ts backend/src/app.module.ts
git commit -m "feat(prontuario): controller + module + wiring no AppModule"
```

---

### Task 8: e2e (matriz RBAC + fluxos + audit)

**Files:**
- Create: `backend/test/prontuario.e2e-spec.ts`

- [ ] **Step 1: Escrever e2e (segue padrão de `backend/test/agenda.e2e-spec.ts`)**

Estrutura (preencher com o helper `loginAs`/seed do padrão existente — abrir `agenda.e2e-spec.ts` e replicar `beforeAll` que cria app, paciente, profissional médico+usuário, profissional não-médico+usuário, recepção, agendamento ATENDIDO do paciente):

```typescript
// Cenários obrigatórios (cada um um it()):
// 1. RECEPCAO faz GET /api/pacientes/:id/prontuario → 403
// 2. MEDICO POST evolucao (agendamento do paciente) → 201, retorna versao 1
// 3. MEDICO GET prontuario → 200, lista a evolução criada
// 4. NAO_MEDICO POST evolucao própria → 201
// 5. NAO_MEDICO GET prontuario → vê só a própria (não a do médico)
// 6. NAO_MEDICO GET /api/evolucoes/<id_do_medico> → 404
// 7. MEDICO POST /api/evolucoes/<id>/retificar → 201, versao 2, replacesId set
// 8. MEDICO GET prontuario → evolução atual é a versao 2 (versao 1 não aparece na lista)
// 9. MEDICO retificar a versao 1 (já substituída) → 409
// 10. NAO_MEDICO retificar evolução do MEDICO → 403
// 11. POST evolucao com agendamentoId de outro paciente → 400
// 12. ADMIN GET prontuario → 200 (vê tudo); ADMIN POST evolucao → 403
// 13. Após GET prontuario, existe registro em `auditoria` com acao VISUALIZACAO_PRONTUARIO
```

Cada `it()` usa `request(app.getHttpServer())` com `Authorization: Bearer <token>` do perfil. Verificar `res.status` e `res.body.data`. Para o cenário 13, consultar via `prisma.auditoria.findFirst({ where: { acao: 'VISUALIZACAO_PRONTUARIO' } })`.

- [ ] **Step 2: Rodar e2e (requer DB)**

Run: `npm --workspace backend run dev:db` (se necessário) e
`npm --workspace backend run test:e2e -- --testPathPattern=prontuario`
Expected: todos os cenários PASS.

- [ ] **Step 3: Ajustar até verde**

Se algum cenário falhar, corrigir service/controller (não o teste, salvo erro no próprio teste). Re-rodar até PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/test/prontuario.e2e-spec.ts
git commit -m "test(prontuario): e2e matriz RBAC + retificacao + audit visualizacao"
```

---

### Task 9: Verificação final + suíte completa

- [ ] **Step 1: Suíte unit completa**

Run: `npm --workspace backend test`
Expected: todos verdes (214 anteriores + novos de prontuário).

- [ ] **Step 2: e2e completo**

Run: `npm --workspace backend run test:e2e`
Expected: todos verdes.

- [ ] **Step 3: Lint**

Run: `npm --workspace backend run lint`
Expected: 0 erros.

- [ ] **Step 4: Commit final (se houver ajuste)**

```bash
git add -A
git commit -m "chore(prontuario): suite completa verde + lint"
```

---

## Self-Review (preenchido)

**Cobertura da spec:**
- Modelo append-only + versão → Task 1.
- SOAP DTOs → Task 2.
- criarEvolucao + lazy prontuário + autorEhMedico → Task 3.
- RBAC leitura (médico/admin todas; não-médico próprias) + audit visualização → Task 4.
- obterEvolucao + cadeia + 404 não-médico → Task 5.
- retificar (versão, 403 não-autor, 409 não-atual, 404) → Task 6.
- Endpoints + RECEPÇÃO 403 + ADMIN não cria → Task 7.
- Transação/rollback → coberto em criar/retificar ($transaction).
- Edge cases (agendamento de outro paciente 400, etc) → Tasks 3/5/6/8.
- Auditoria de visualização e alteração → Tasks 4/5 + e2e Task 8.

**Sem placeholders:** código real em cada step.

**Consistência de tipos:** `criarEvolucao/listarProntuario/obterEvolucao/retificar(…, user: AuthUser, ip, trace)` usados igual em service, controller e testes. Ações de audit com nomes fixos. `replacedBy` usado para "atual" tanto em listar quanto em retificar.

**Pontos a confirmar na execução (não bloqueiam):**
- Import de `AuditModule` no `ProntuarioModule` — replicar exatamente o padrão de `pacientes.module.ts`.
- `Prisma.EvolucaoWhereInput` aceitar `replacedBy: null` (filtro de relação to-one nula no Prisma) — se a versão do Prisma exigir `{ is: null }`, ajustar para `replacedBy: { is: null }`.
