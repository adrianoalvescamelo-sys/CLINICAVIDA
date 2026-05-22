# Documentos médicos PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API backend para gerar, armazenar (PDF imutável em bytea) e baixar documentos médicos (receita, atestado, pedido de exame, orientações) com RBAC por tipo e auditoria.

**Architecture:** Novo módulo NestJS `backend/src/documentos/` (controller + service + renderers pdfkit + DTO). Modelo Prisma `DocumentoMedico` + enum `TipoDocumento`. Reusa `PrismaService`, `AuditService`, `@Roles`/`@CurrentUser`, padrão `StreamableFile` de relatórios e `pdfkit` (já no projeto).

**Tech Stack:** NestJS, Prisma, PostgreSQL (bytea), pdfkit, Jest (unit), Supertest (e2e), class-validator.

Spec: [docs/superpowers/specs/2026-05-22-documentos-pdf-design.md](../specs/2026-05-22-documentos-pdf-design.md)

---

## File Structure

- `backend/prisma/schema.prisma` — + enum `TipoDocumento`, model `DocumentoMedico`; relações inversas em `Paciente`, `Usuario`, `Agendamento`.
- `backend/src/documentos/documentos.module.ts` — módulo.
- `backend/src/documentos/documentos.controller.ts` — rotas + StreamableFile no /pdf.
- `backend/src/documentos/documentos.service.ts` — RBAC por tipo, validação de conteúdo, transação, audit, filtro leitura.
- `backend/src/documentos/documentos.pdf.ts` — geração pdfkit por tipo (puro).
- `backend/src/documentos/dto/criar-documento.dto.ts` — DTO.
- `backend/src/documentos/documentos.pdf.spec.ts` — unit dos renderers.
- `backend/src/documentos/documentos.service.spec.ts` — unit do service.
- `backend/test/documentos.e2e-spec.ts` — e2e.
- `backend/src/app.module.ts` — importar `DocumentosModule`.

**Assinaturas (consistência entre tasks):**
- `gerarDocumentoPdf(input: PdfInput): Promise<Buffer>` onde `PdfInput = { tipo: TipoDocumento; paciente: string; autor: string; conteudo: Record<string, unknown> }`.
- Service: `criarDocumento(pacienteId, dto, user, ip, trace)`, `listar(pacienteId, user, ip, trace)`, `obter(id, user, ip, trace)`, `baixarPdf(id, user, ip, trace)`.
- `user: AuthUser` (`{ id, email, perfil }`).
- Ações de audit: `GERACAO_DOCUMENTO`, `VISUALIZACAO_DOCUMENTO`, `DOWNLOAD_DOCUMENTO`.

---

### Task 1: Schema Prisma + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Adicionar enum + model + relações inversas**

Adicionar ao `schema.prisma`:
```prisma
enum TipoDocumento {
  RECEITA
  ATESTADO
  PEDIDO_EXAME
  ORIENTACOES
}

model DocumentoMedico {
  id             String        @id @default(uuid()) @db.Uuid
  pacienteId     String        @map("paciente_id") @db.Uuid
  autorUsuarioId String        @map("autor_usuario_id") @db.Uuid
  autorEhMedico  Boolean       @map("autor_eh_medico")
  agendamentoId  String?       @map("agendamento_id") @db.Uuid
  tipo           TipoDocumento
  conteudo       Json
  pdf            Bytes
  createdAt      DateTime      @default(now()) @map("created_at")

  paciente    Paciente     @relation(fields: [pacienteId], references: [id])
  autor       Usuario      @relation(fields: [autorUsuarioId], references: [id])
  agendamento Agendamento? @relation(fields: [agendamentoId], references: [id])

  @@index([pacienteId, createdAt])
  @@index([autorUsuarioId])
  @@map("documentos_medicos")
}
```
Relações inversas:
- `Paciente { … }`: `documentos DocumentoMedico[]`
- `Usuario { … }`: `documentos DocumentoMedico[]`
- `Agendamento { … }`: `documentos DocumentoMedico[]`

- [ ] **Step 2: Validar + gerar migration**

Run: `npm --workspace backend exec prisma validate` → Expected: schema válido.
Run (DB de dev rodando — `npm run dev:db`): `cd backend && npx prisma migrate dev --name documentos_medicos`
Expected: migration criada, client regenerado, sem erro.

Se não houver DB disponível: gerar SQL via diff (sem aplicar) e criar a pasta da migration manualmente —
`git show HEAD:backend/prisma/schema.prisma > /tmp/schema_old.prisma`
`cd backend && npx prisma migrate diff --from-schema-datamodel /tmp/schema_old.prisma --to-schema-datamodel ./prisma/schema.prisma --script > prisma/migrations/<timestamp>_documentos_medicos/migration.sql`
e `npx prisma generate`. Aplicar com `migrate deploy` quando o DB subir.

- [ ] **Step 3: tsc**

Run: `cd backend && npx tsc --noEmit` → Expected: 0 erros (tipos `DocumentoMedico`/`TipoDocumento` em `@prisma/client`).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(documentos): schema DocumentoMedico + enum TipoDocumento + migration"
```

---

### Task 2: DTO

**Files:**
- Create: `backend/src/documentos/dto/criar-documento.dto.ts`

- [ ] **Step 1: criar-documento.dto.ts**

```typescript
import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { TipoDocumento } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CriarDocumentoDto {
  @IsEnum(TipoDocumento)
  tipo!: TipoDocumento;

  @IsOptional()
  @IsUUID()
  agendamentoId?: string;

  // conteúdo é validado por tipo no service (shape varia)
  @IsObject()
  conteudo!: Record<string, unknown>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/documentos/dto
git commit -m "feat(documentos): DTO criar-documento"
```

---

### Task 3: Renderers PDF (TDD)

**Files:**
- Create: `backend/src/documentos/documentos.pdf.ts`
- Test: `backend/src/documentos/documentos.pdf.spec.ts`

- [ ] **Step 1: Teste que falha**

Criar `documentos.pdf.spec.ts`:
```typescript
import { gerarDocumentoPdf } from './documentos.pdf';
import { TipoDocumento } from '@prisma/client';

describe('gerarDocumentoPdf', () => {
  const base = { paciente: 'Fulano de Tal', autor: 'Dr. Beltrano' };

  it('ATESTADO gera Buffer PDF (%PDF) não-vazio', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.ATESTADO,
      ...base,
      conteudo: { diasAfastamento: 3, cid: 'J11', motivo: 'gripe' },
    });
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('RECEITA gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.RECEITA,
      ...base,
      conteudo: { medicamentos: [{ nome: 'Dipirona', posologia: '1cp 8/8h' }] },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('PEDIDO_EXAME gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.PEDIDO_EXAME,
      ...base,
      conteudo: { exames: ['Hemograma', 'Glicemia'] },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('ORIENTACOES gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.ORIENTACOES,
      ...base,
      conteudo: { texto: 'Repouso e hidratação.' },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm --workspace backend test -- --testPathPattern=documentos.pdf`
Expected: FAIL — `Cannot find module './documentos.pdf'`.

- [ ] **Step 3: Implementar renderers**

Criar `documentos.pdf.ts`:
```typescript
import PDFDocument from 'pdfkit';
import { TipoDocumento } from '@prisma/client';

export interface PdfInput {
  tipo: TipoDocumento;
  paciente: string;
  autor: string;
  conteudo: Record<string, unknown>;
}

const TITULO: Record<TipoDocumento, string> = {
  RECEITA: 'Receita Médica',
  ATESTADO: 'Atestado Médico',
  PEDIDO_EXAME: 'Pedido de Exame',
  ORIENTACOES: 'Orientações',
};

function fmtDate(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function gerarDocumentoPdf(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header — identidade visual
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Clínica Vida Popular — Sinop/MT', { align: 'center' });
    doc
      .fontSize(13)
      .text(TITULO[input.tipo], { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');
    doc.text(`Paciente: ${input.paciente}`);
    doc.text(`Profissional: ${input.autor}`);
    doc.text(`Data: ${fmtDate(new Date())}`);
    doc.moveDown();

    // Corpo por tipo
    const c = input.conteudo;
    if (input.tipo === 'ATESTADO') {
      const dias = c.diasAfastamento;
      doc.text(`Atesto, para os devidos fins, afastamento de ${dias} dia(s).`);
      if (c.cid) doc.text(`CID: ${String(c.cid)}`);
      if (c.motivo) doc.text(`Motivo: ${String(c.motivo)}`);
    } else if (input.tipo === 'RECEITA') {
      doc.font('Helvetica-Bold').text('Prescrição:').font('Helvetica');
      const meds = (c.medicamentos as { nome: string; posologia: string }[]) ?? [];
      meds.forEach((m, i) =>
        doc.text(`${i + 1}. ${m.nome} — ${m.posologia}`, { lineGap: 2 }),
      );
    } else if (input.tipo === 'PEDIDO_EXAME') {
      doc.font('Helvetica-Bold').text('Exames solicitados:').font('Helvetica');
      const exames = (c.exames as string[]) ?? [];
      exames.forEach((e, i) => doc.text(`${i + 1}. ${e}`, { lineGap: 2 }));
    } else {
      doc.text(String(c.texto ?? ''));
    }

    // Assinatura
    doc.moveDown(4);
    doc.text('_______________________________', { align: 'center' });
    doc.text(input.autor, { align: 'center' });

    doc.end();
  });
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm --workspace backend test -- --testPathPattern=documentos.pdf`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/documentos/documentos.pdf.ts backend/src/documentos/documentos.pdf.spec.ts
git commit -m "feat(documentos): renderers pdfkit por tipo (TDD)"
```

---

### Task 4: Service.criarDocumento (RBAC por tipo + validação + PDF + audit) (TDD)

**Files:**
- Create: `backend/src/documentos/documentos.service.ts`
- Test: `backend/src/documentos/documentos.service.spec.ts`

- [ ] **Step 1: Teste que falha**

Criar `documentos.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditResultado, TipoDocumento } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PAC = '22222222-2222-4222-8222-222222222222';
const AG = '33333333-3333-4333-8333-333333333333';
const DOC = '66666666-6666-4666-8666-666666666666';
const MEDICO = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'm@x', perfil: 'MEDICO' };
const NAOMED = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'n@x', perfil: 'PROFISSIONAL_NAO_MEDICO' };

function makePrisma() {
  const tx = {
    documentoMedico: { create: jest.fn() },
    auditoria: { create: jest.fn() },
  };
  return {
    documentoMedico: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    agendamento: { findUnique: jest.fn() },
    profissional: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    _tx: tx,
  };
}
function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('DocumentosService', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(async () => {
    prisma = makePrisma();
    audit = makeAudit();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(DocumentosService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('criarDocumento', () => {
    it('médico cria ORIENTACOES: gera PDF, persiste, audita', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma._tx.documentoMedico.create.mockResolvedValue({
        id: DOC, tipo: TipoDocumento.ORIENTACOES, pacienteId: PAC,
      });

      const r = await service.criarDocumento(
        PAC,
        { tipo: TipoDocumento.ORIENTACOES, conteudo: { texto: 'Repouso' } } as never,
        MEDICO as never,
        'ip',
        't',
      );

      expect(r.id).toBe(DOC);
      // pdf não retornado ao cliente
      expect((r as Record<string, unknown>).pdf).toBeUndefined();
      const createArg = prisma._tx.documentoMedico.create.mock.calls[0][0];
      expect(Buffer.isBuffer(createArg.data.pdf)).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'GERACAO_DOCUMENTO', resultado: AuditResultado.SUCESSO }),
      );
    });

    it('não-médico tentando RECEITA → 403', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: false });
      await expect(
        service.criarDocumento(
          PAC,
          { tipo: TipoDocumento.RECEITA, conteudo: { medicamentos: [{ nome: 'x', posologia: 'y' }] } } as never,
          NAOMED as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma._tx.documentoMedico.create).not.toHaveBeenCalled();
    });

    it('conteúdo inválido p/ ATESTADO (sem diasAfastamento) → 400', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      await expect(
        service.criarDocumento(
          PAC,
          { tipo: TipoDocumento.ATESTADO, conteudo: {} } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('agendamento de outro paciente → 400', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: 'outro' });
      await expect(
        service.criarDocumento(
          PAC,
          { tipo: TipoDocumento.ORIENTACOES, agendamentoId: AG, conteudo: { texto: 'x' } } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: FAIL — `Cannot find module './documentos.service'`.

- [ ] **Step 3: Implementar service (criarDocumento + helpers)**

Criar `documentos.service.ts`:
```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuditResultado, Prisma, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { gerarDocumentoPdf } from './documentos.pdf';

const SO_MEDICO: TipoDocumento[] = [
  TipoDocumento.RECEITA,
  TipoDocumento.ATESTADO,
];

@Injectable()
export class DocumentosService {
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

  private isMedicoOuAdmin(user: AuthUser): boolean {
    return user.perfil === 'MEDICO' || user.perfil === 'ADMIN';
  }

  private validarConteudo(tipo: TipoDocumento, c: Record<string, unknown>) {
    const erro = () => {
      throw new BadRequestException({
        code: 'CONTEUDO_INVALIDO',
        message: `Conteúdo inválido para ${tipo}`,
      });
    };
    if (tipo === TipoDocumento.ATESTADO) {
      if (typeof c.diasAfastamento !== 'number' || c.diasAfastamento < 1) erro();
    } else if (tipo === TipoDocumento.RECEITA) {
      const m = c.medicamentos;
      if (!Array.isArray(m) || m.length === 0) erro();
    } else if (tipo === TipoDocumento.PEDIDO_EXAME) {
      const e = c.exames;
      if (!Array.isArray(e) || e.length === 0) erro();
    } else if (tipo === TipoDocumento.ORIENTACOES) {
      if (typeof c.texto !== 'string' || c.texto.trim() === '') erro();
    }
  }

  async criarDocumento(
    pacienteId: string,
    dto: CriarDocumentoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const autorEhMedico = await this.ehMedico(user);

    if (SO_MEDICO.includes(dto.tipo) && !autorEhMedico) {
      throw new ForbiddenException({
        code: 'PERFIL_NAO_AUTORIZADO_DOCUMENTO',
        message: 'Apenas médico pode emitir receita ou atestado',
      });
    }

    this.validarConteudo(dto.tipo, dto.conteudo);

    if (dto.agendamentoId) {
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
    }

    const paciente = await this.prisma.paciente.findUnique({
      where: { id: pacienteId },
      select: { nomeCompleto: true },
    });
    if (!paciente) {
      throw new BadRequestException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }

    const pdf = await gerarDocumentoPdf({
      tipo: dto.tipo,
      paciente: paciente.nomeCompleto,
      autor: user.email,
      conteudo: dto.conteudo,
    });

    const doc = await this.prisma.$transaction((tx) =>
      tx.documentoMedico.create({
        data: {
          pacienteId,
          autorUsuarioId: user.id,
          autorEhMedico,
          agendamentoId: dto.agendamentoId,
          tipo: dto.tipo,
          conteudo: dto.conteudo as Prisma.InputJsonValue,
          pdf,
        },
        select: {
          id: true,
          tipo: true,
          conteudo: true,
          pacienteId: true,
          autorUsuarioId: true,
          autorEhMedico: true,
          agendamentoId: true,
          createdAt: true,
        },
      }),
    );

    await this.audit.log({
      usuarioId: user.id,
      acao: 'GERACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { tipo: dto.tipo, pacienteId } as Prisma.InputJsonValue,
    });

    return doc;
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/documentos/documentos.service.ts backend/src/documentos/documentos.service.spec.ts
git commit -m "feat(documentos): criarDocumento com RBAC por tipo + validacao + PDF + audit (TDD)"
```

---

### Task 5: Service.listar + obter (RBAC leitura + audit) (TDD)

**Files:**
- Modify: `backend/src/documentos/documentos.service.ts`
- Modify: `backend/src/documentos/documentos.service.spec.ts`

- [ ] **Step 1: Testes que falham**

Adicionar ao spec (dentro de `describe('DocumentosService')`):
```typescript
  describe('listar', () => {
    it('médico lista todos do paciente (sem filtro de autor) e audita', async () => {
      prisma.documentoMedico.findMany.mockResolvedValue([{ id: DOC }]);
      const r = await service.listar(PAC, MEDICO as never, 'ip', 't');
      expect(r).toHaveLength(1);
      const whereArg = prisma.documentoMedico.findMany.mock.calls[0][0].where;
      expect(whereArg.pacienteId).toBe(PAC);
      expect(whereArg.autorUsuarioId).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_DOCUMENTO' }),
      );
    });

    it('não-médico lista só os próprios (filtro autorUsuarioId)', async () => {
      prisma.documentoMedico.findMany.mockResolvedValue([]);
      await service.listar(PAC, NAOMED as never, 'ip', 't');
      const whereArg = prisma.documentoMedico.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBe(NAOMED.id);
    });
  });

  describe('obter', () => {
    it('retorna metadados (sem pdf) e audita', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({ id: DOC, autorUsuarioId: MEDICO.id });
      const r = await service.obter(DOC, MEDICO as never, 'ip', 't');
      expect(r.id).toBe(DOC);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_DOCUMENTO', registroId: DOC }),
      );
    });

    it('não-médico obtendo doc de outro → 404', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({ id: DOC, autorUsuarioId: 'outro' });
      await expect(
        service.obter(DOC, NAOMED as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```
Adicionar import no topo do spec: `import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';` (substituir o import existente).

- [ ] **Step 2: Rodar — falha**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: FAIL — `service.listar is not a function`.

- [ ] **Step 3: Implementar listar + obter**

Adicionar import `NotFoundException` no topo do service (`import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';`).
Adicionar métodos:
```typescript
  private readonly metaSelect = {
    id: true,
    tipo: true,
    conteudo: true,
    pacienteId: true,
    autorUsuarioId: true,
    autorEhMedico: true,
    agendamentoId: true,
    createdAt: true,
  };

  async listar(pacienteId: string, user: AuthUser, ip: string, trace: string) {
    const where: Prisma.DocumentoMedicoWhereInput = { pacienteId };
    if (!this.isMedicoOuAdmin(user)) {
      where.autorUsuarioId = user.id;
    }
    const docs = await this.prisma.documentoMedico.findMany({
      where,
      select: this.metaSelect,
      orderBy: { createdAt: 'desc' },
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: null,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId } as Prisma.InputJsonValue,
    });

    return docs;
  }

  async obter(id: string, user: AuthUser, ip: string, trace: string) {
    const doc = await this.prisma.documentoMedico.findUnique({
      where: { id },
      select: this.metaSelect,
    });
    if (
      !doc ||
      (!this.isMedicoOuAdmin(user) && doc.autorUsuarioId !== user.id)
    ) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NAO_ENCONTRADO',
        message: 'Documento não encontrado',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return doc;
  }
```

- [ ] **Step 4: Rodar — passa**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/documentos/documentos.service.ts backend/src/documentos/documentos.service.spec.ts
git commit -m "feat(documentos): listar/obter com RBAC leitura + audit"
```

---

### Task 6: Service.baixarPdf (TDD)

**Files:**
- Modify: `backend/src/documentos/documentos.service.ts`
- Modify: `backend/src/documentos/documentos.service.spec.ts`

- [ ] **Step 1: Testes que falham**

Adicionar ao spec:
```typescript
  describe('baixarPdf', () => {
    it('retorna pdf+tipo e audita DOWNLOAD_DOCUMENTO', async () => {
      const pdf = Buffer.from('%PDF-1.3 fake');
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC, autorUsuarioId: MEDICO.id, tipo: TipoDocumento.RECEITA, pdf,
      });
      const r = await service.baixarPdf(DOC, MEDICO as never, 'ip', 't');
      expect(r.pdf).toBe(pdf);
      expect(r.tipo).toBe(TipoDocumento.RECEITA);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'DOWNLOAD_DOCUMENTO', registroId: DOC }),
      );
    });

    it('não-médico baixando doc de outro → 404', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC, autorUsuarioId: 'outro', tipo: TipoDocumento.RECEITA, pdf: Buffer.from('x'),
      });
      await expect(
        service.baixarPdf(DOC, NAOMED as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 2: Rodar — falha**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: FAIL — `service.baixarPdf is not a function`.

- [ ] **Step 3: Implementar baixarPdf**

Adicionar ao service:
```typescript
  async baixarPdf(id: string, user: AuthUser, ip: string, trace: string) {
    const doc = await this.prisma.documentoMedico.findUnique({
      where: { id },
      select: { id: true, autorUsuarioId: true, tipo: true, pdf: true },
    });
    if (
      !doc ||
      (!this.isMedicoOuAdmin(user) && doc.autorUsuarioId !== user.id)
    ) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NAO_ENCONTRADO',
        message: 'Documento não encontrado',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'DOWNLOAD_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return { pdf: doc.pdf as Buffer, tipo: doc.tipo };
  }
```

- [ ] **Step 4: Rodar — passa**

Run: `npm --workspace backend test -- --testPathPattern=documentos.service`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/documentos/documentos.service.ts backend/src/documentos/documentos.service.spec.ts
git commit -m "feat(documentos): baixarPdf com RBAC + audit download"
```

---

### Task 7: Controller + module + wiring

**Files:**
- Create: `backend/src/documentos/documentos.controller.ts`
- Create: `backend/src/documentos/documentos.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Controller**

Criar `documentos.controller.ts`:
```typescript
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller()
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  private ip(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
  private trace(req: Request): string {
    return (req as unknown as { trace_id?: string }).trace_id ?? 'unknown';
  }

  @Post('pacientes/:pacienteId/documentos')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  criar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @Body() dto: CriarDocumentoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.criarDocumento(
      pacienteId,
      dto,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Get('pacientes/:pacienteId/documentos')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  listar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.listar(
      pacienteId,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Get('documentos/:id')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.obter(id, user, this.ip(req), this.trace(req));
  }

  @Get('documentos/:id/pdf')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @Header('Content-Type', 'application/pdf')
  async baixar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const { pdf, tipo } = await this.documentos.baixarPdf(
      id,
      user,
      this.ip(req),
      this.trace(req),
    );
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${tipo.toLowerCase()}-${id}.pdf"`,
    });
  }
}
```

> Nota: rotas que retornam `StreamableFile` precisam escapar do envelope global. Verificar em `relatorios.controller.ts` se há `@SkipResponseInterceptor()` nas rotas de PDF e replicar o mesmo decorator nas rotas `/pdf` aqui (importar de `../common/decorators`). Se relatórios não usa, o `ResponseInterceptor` deve já tratar `StreamableFile` — confirmar olhando o interceptor.

- [ ] **Step 2: Verificar tratamento de StreamableFile no envelope**

Run: `grep -rnE "StreamableFile|SkipResponseInterceptor" backend/src/relatorios/relatorios.controller.ts backend/src/common/interceptors/*.ts`
Aplicar `@SkipResponseInterceptor()` nas rotas `/pdf` e `/documentos/:id/pdf` **se** for o padrão usado por relatórios. Caso o interceptor já ignore `StreamableFile`, não fazer nada.

- [ ] **Step 3: Module**

Criar `documentos.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';

@Module({
  controllers: [DocumentosController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
```

- [ ] **Step 4: Wiring no AppModule**

Em `backend/src/app.module.ts`: importar `DocumentosModule` e adicionar ao array `imports` (após `ProntuarioModule`).

- [ ] **Step 5: tsc + lint**

Run: `cd backend && npx tsc --noEmit` → 0 erros.
Run: `npm --workspace backend run lint` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/documentos backend/src/app.module.ts
git commit -m "feat(documentos): controller (StreamableFile pdf) + module + wiring"
```

---

### Task 8: e2e (RBAC + geração + download + audit)

**Files:**
- Create: `backend/test/documentos.e2e-spec.ts`

- [ ] **Step 1: Escrever e2e (segue padrão de `backend/test/prontuario.e2e-spec.ts`)**

Replicar o `beforeAll`/`cleanup`/`criarToken` de `prontuario.e2e-spec.ts` (cria admin, recepção, médico+profissional médico vinculado, não-médico+profissional não-médico vinculado, paciente; agendamento opcional). Cenários (cada um um `it()`):
```
// 1. RECEPÇÃO POST documento → 403
// 2. MÉDICO POST ATESTADO {diasAfastamento:3} → 201, retorna metadados sem pdf
// 3. MÉDICO GET /pacientes/:id/documentos → lista inclui o atestado
// 4. MÉDICO GET /documentos/:docId/pdf → 200, content-type application/pdf, corpo começa com %PDF
// 5. NÃO-MÉDICO POST RECEITA → 403
// 6. NÃO-MÉDICO POST ORIENTACOES {texto} → 201
// 7. NÃO-MÉDICO GET lista → vê só o próprio (não o do médico)
// 8. NÃO-MÉDICO GET /documentos/<id_do_medico> → 404
// 9. ADMIN POST documento → 403; ADMIN GET lista → 200
// 10. POST ATESTADO conteudo:{} → 400
// 11. POST com agendamentoId de outro paciente → 400
// 12. auditoria tem GERACAO_DOCUMENTO e DOWNLOAD_DOCUMENTO
```
Para o cenário 4, usar `.expect('Content-Type', /application\/pdf/)` e checar `res.body` (Buffer) — com supertest, usar `.buffer()` / `.parse` ou checar `res.headers['content-type']` e `Buffer.from(res.body).subarray(0,4).toString()`. Para o 12, `prisma.auditoria.findFirst({ where: { acao: 'GERACAO_DOCUMENTO' } })`.

Cleanup: deletar `documentoMedico` do paciente antes de pacientes/profissionais/usuários (ordem FK).

- [ ] **Step 2: Rodar e2e (DB + serial)**

Run: `npm --workspace backend run dev:db` (se necessário) e
`npm --workspace backend run test:e2e -- --runInBand --testPathPattern=documentos`
Expected: todos PASS.

- [ ] **Step 3: Ajustar até verde**

Corrigir service/controller conforme falhas (não o teste, salvo erro no teste). Atenção ao tratamento do `StreamableFile`/envelope no cenário 4.

- [ ] **Step 4: Commit**

```bash
git add backend/test/documentos.e2e-spec.ts
git commit -m "test(documentos): e2e RBAC + geracao + download PDF + audit"
```

---

### Task 9: Verificação final

- [ ] **Step 1: Unit completo**

Run: `npm --workspace backend test`
Expected: todos verdes (227 anteriores + documentos).

- [ ] **Step 2: e2e completo (serial)**

Run: `npm --workspace backend run test:e2e -- --runInBand`
Expected: todos verdes.

- [ ] **Step 3: Lint**

Run: `npm --workspace backend run lint`
Expected: 0 erros.

- [ ] **Step 4: Commit final (se houver ajuste)**

```bash
git add -A
git commit -m "chore(documentos): suite completa verde + lint"
```

---

## Self-Review (preenchido)

**Cobertura da spec:**
- Modelo DocumentoMedico + enum + bytea → Task 1.
- DTO → Task 2.
- PDF por tipo + identidade visual → Task 3.
- Geração + RBAC por tipo + validação conteúdo + transação + audit → Task 4.
- Leitura/listagem + RBAC leitura + audit visualização → Task 5.
- Download + audit → Task 6.
- Endpoints + StreamableFile + RECEPÇÃO 403 + ADMIN não gera → Task 7.
- e2e matriz RBAC + geração + download + audit → Task 8.
- Edge cases (não-médico+receita 403, conteúdo inválido 400, agendamento de outro paciente 400, doc alheio 404, recepção 403) → Tasks 4/5/6/8.

**Sem placeholders:** código real em cada step. (Task 8 descreve cenários e referencia o padrão exato a copiar de `prontuario.e2e-spec.ts` — código de teste segue 1:1 esse arquivo já existente.)

**Consistência de tipos:** `criarDocumento/listar/obter/baixarPdf(…, user: AuthUser, ip, trace)` iguais em service/controller/spec. `gerarDocumentoPdf(PdfInput): Promise<Buffer>` usado em service e testado em Task 3. `metaSelect` (sem `pdf`) reusado em listar/obter. Ações de audit fixas.

**Ponto a confirmar na execução (não bloqueia):**
- Tratamento de `StreamableFile` vs `ResponseInterceptor` global (Task 7 Step 2) — replicar o que `relatorios.controller.ts` faz nas rotas de PDF.
- `Prisma.DocumentoMedicoWhereInput` disponível após `prisma generate` (Task 1).
