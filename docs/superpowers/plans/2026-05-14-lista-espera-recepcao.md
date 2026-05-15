# Lista de Espera e Recepcao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sprint 5 MVP for waiting list and reception dashboard, integrated with existing patients, agenda, WhatsApp pending queue, and role-based access.

**Architecture:** Add a dedicated waiting-list aggregate in Prisma plus a small reception read model assembled from existing `agendamentos`, `mensagens_whatsapp`, and new waiting-list rows. Keep write operations in focused Nest modules and expose one summary endpoint for reception screen so frontend can load one payload fast and filter client-side for common use.

**Tech Stack:** NestJS, Prisma, PostgreSQL, React, Vite, TypeScript, Zustand auth store, existing response envelope/interceptors.

---

### Task 1: Create waiting-list database model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_lista_espera/migration.sql`
- Test: `backend/test/lista-espera.e2e-spec.ts`

- [ ] **Step 1: Add Prisma enum and model**

```prisma
enum ListaEsperaStatus {
  ATIVO
  CONTATADO
  RECUSADO
  AGENDADO
  CANCELADO
}

model ListaEspera {
  id                   String             @id @default(uuid()) @db.Uuid
  pacienteId           String             @map("paciente_id") @db.Uuid
  paciente             Paciente           @relation(fields: [pacienteId], references: [id])
  profissionalId       String?            @map("profissional_id") @db.Uuid
  profissional         Profissional?      @relation(fields: [profissionalId], references: [id])
  especialidade        String?
  prioridade           Int                @default(0)
  melhoresHorarios     Json?
  observacoes          String?
  status               ListaEsperaStatus  @default(ATIVO)
  ultimaOfertaEm       DateTime?          @map("ultima_oferta_em")
  ultimaRespostaEm     DateTime?          @map("ultima_resposta_em")
  motivoRecusa         String?            @map("motivo_recusa")
  criadoPor            String?            @map("criado_por") @db.Uuid
  updatedAt            DateTime           @updatedAt @map("updated_at")
  createdAt            DateTime           @default(now()) @map("created_at")

  @@index([status, prioridade, createdAt])
  @@index([pacienteId, status])
  @@unique([pacienteId, profissionalId, especialidade, status], map: "lista_espera_ativa_unica")
  @@map("lista_espera")
}
```

- [ ] **Step 2: Generate SQL migration**

Run: `npm --workspace backend run prisma:migrate -- --name lista_espera`

Expected: Prisma creates migration directory with table, enum, indexes.

- [ ] **Step 3: Adjust unique constraint for duplicate-active rule**

```sql
CREATE UNIQUE INDEX "lista_espera_ativa_unica"
ON "lista_espera" ("paciente_id", "profissional_id", "especialidade", "status")
WHERE "status" IN ('ATIVO', 'CONTATADO', 'RECUSADO');
```

- [ ] **Step 4: Generate Prisma client**

Run: `npm --workspace backend run prisma:generate`

Expected: Prisma client updates with `ListaEspera` model and `ListaEsperaStatus` enum.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add waiting list schema"
```

### Task 2: Build waiting-list backend module

**Files:**
- Create: `backend/src/lista-espera/lista-espera.module.ts`
- Create: `backend/src/lista-espera/lista-espera.controller.ts`
- Create: `backend/src/lista-espera/lista-espera.service.ts`
- Create: `backend/src/lista-espera/dto/create-lista-espera.dto.ts`
- Create: `backend/src/lista-espera/dto/update-lista-espera.dto.ts`
- Create: `backend/src/lista-espera/dto/query-lista-espera.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/lista-espera.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e skeleton**

```ts
it('POST /api/lista-espera creates row and blocks duplicate active entry', async () => {
  const first = await request(app.getHttpServer())
    .post('/api/lista-espera')
    .set('Authorization', `Bearer ${recepcaoToken}`)
    .send(payload)
    .expect(201);

  expect(first.body.success).toBe(true);

  await request(app.getHttpServer())
    .post('/api/lista-espera')
    .set('Authorization', `Bearer ${recepcaoToken}`)
    .send(payload)
    .expect(409);
});
```

- [ ] **Step 2: Add DTOs with reception/admin-safe inputs**

```ts
export class CreateListaEsperaDto {
  @IsUUID()
  pacienteId!: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  especialidade?: string;

  @IsInt()
  @Min(0)
  @Max(999)
  prioridade!: number;

  @IsOptional()
  melhoresHorarios?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes?: string;
}
```

- [ ] **Step 3: Implement service rules**

```ts
async create(dto: CreateListaEsperaDto, ctx: CallerCtx) {
  await this.assertPaciente(dto.pacienteId);
  await this.assertProfissional(dto.profissionalId);
  await this.assertNoDuplicate(dto);

  const row = await this.prisma.listaEspera.create({
    data: {
      ...dto,
      status: ListaEsperaStatus.ATIVO,
      criadoPor: ctx.usuarioId,
    },
    include: this.includePacienteProfissional,
  });

  await this.audit.log({
    usuarioId: ctx.usuarioId,
    acao: 'CREATE',
    entidade: 'ListaEspera',
    registroId: row.id,
    ipDispositivo: ctx.ip,
    resultado: AuditResultado.SUCESSO,
    traceId: ctx.traceId,
    detalhes: { prioridade: row.prioridade },
  });

  return row;
}
```

- [ ] **Step 4: Implement list/update/contact/resolve endpoints**

```ts
@Controller('lista-espera')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
export class ListaEsperaController {
  @Post() create(...) {}
  @Get() findAll(@Query() query: QueryListaEsperaDto) {}
  @Patch(':id') update(...) {}
  @Post(':id/ofertar-vaga') ofertarVaga(...) {}
  @Post(':id/registrar-recusa') registrarRecusa(...) {}
  @Post(':id/marcar-agendado') marcarAgendado(...) {}
}
```

- [ ] **Step 5: Register module and verify tests**

Run: `npm --workspace backend run test:e2e -- --runInBand lista-espera.e2e-spec.ts`

Expected: create/list/update/duplicate/permission cases pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lista-espera backend/src/app.module.ts backend/test/lista-espera.e2e-spec.ts
git commit -m "feat: add waiting list api"
```

### Task 3: Build reception dashboard backend aggregator

**Files:**
- Create: `backend/src/recepcao/recepcao.module.ts`
- Create: `backend/src/recepcao/recepcao.controller.ts`
- Create: `backend/src/recepcao/recepcao.service.ts`
- Create: `backend/src/recepcao/dto/query-dashboard.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/recepcao-dashboard.e2e-spec.ts`

- [ ] **Step 1: Write failing summary test**

```ts
it('GET /api/recepcao/dashboard returns agenda, aguardando, pendencias whatsapp and waiting list', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/recepcao/dashboard?data=2026-05-14')
    .set('Authorization', `Bearer ${recepcaoToken}`)
    .expect(200);

  expect(res.body.data).toEqual(
    expect.objectContaining({
      agendaDoDia: expect.any(Array),
      aguardando: expect.any(Array),
      confirmacoesPendentes: expect.any(Array),
      mensagensPendentes: expect.any(Array),
      listaEspera: expect.any(Array),
    }),
  );
});
```

- [ ] **Step 2: Implement dashboard query service**

```ts
async dashboard(query: QueryDashboardDto) {
  const [agendaDoDia, aguardando, confirmacoesPendentes, mensagensPendentes, listaEspera] =
    await Promise.all([
      this.buscarAgendaDoDia(query),
      this.buscarAguardando(query),
      this.buscarConfirmacoesPendentes(query),
      this.buscarMensagensPendentes(),
      this.buscarListaEspera(query),
    ]);

  return {
    agendaDoDia,
    aguardando,
    confirmacoesPendentes,
    mensagensPendentes,
    listaEspera,
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Add filters**

```ts
export class QueryDashboardDto {
  @IsISO8601()
  data!: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsEnum(AgendamentoStatus)
  status?: AgendamentoStatus;
}
```

- [ ] **Step 4: Lock permissions to admin/reception**

```ts
@Controller('recepcao')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
export class RecepcaoController {
  @Get('dashboard')
  dashboard(@Query() query: QueryDashboardDto) {
    return this.service.dashboard(query);
  }
}
```

- [ ] **Step 5: Verify dashboard test**

Run: `npm --workspace backend run test:e2e -- --runInBand recepcao-dashboard.e2e-spec.ts`

Expected: 200 for admin/reception, 403 for doctor, payload sections always present.

- [ ] **Step 6: Commit**

```bash
git add backend/src/recepcao backend/src/app.module.ts backend/test/recepcao-dashboard.e2e-spec.ts
git commit -m "feat: add reception dashboard api"
```

### Task 4: Add frontend API clients and types

**Files:**
- Create: `frontend/src/types/lista-espera.ts`
- Create: `frontend/src/types/recepcao.ts`
- Create: `frontend/src/api/lista-espera.ts`
- Create: `frontend/src/api/recepcao.ts`
- Test: manual via `frontend/src/pages/HomePage.tsx` and new reception page

- [ ] **Step 1: Define waiting-list types**

```ts
export type ListaEsperaStatus =
  | 'ATIVO'
  | 'CONTATADO'
  | 'RECUSADO'
  | 'AGENDADO'
  | 'CANCELADO';

export interface ListaEsperaItem {
  id: string;
  pacienteId: string;
  profissionalId?: string | null;
  especialidade?: string | null;
  prioridade: number;
  status: ListaEsperaStatus;
  createdAt: string;
  paciente: { id: string; nomeCompleto: string; telefoneWhatsapp: string };
  profissional?: { id: string; nomeCompleto: string } | null;
}
```

- [ ] **Step 2: Add API wrappers**

```ts
export async function listarListaEspera(params?: Record<string, string>) {
  const { data } = await api.get<Envelope<ListaEsperaItem[]>>('/lista-espera', { params });
  return data.data;
}

export async function obterDashboardRecepcao(params: { data: string; profissionalId?: string }) {
  const { data } = await api.get<Envelope<RecepcaoDashboard>>('/recepcao/dashboard', { params });
  return data.data;
}
```

- [ ] **Step 3: Reuse envelope pattern from existing clients**

```ts
interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; trace_id: string };
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types frontend/src/api
git commit -m "feat: add reception and waiting list client APIs"
```

### Task 5: Build reception page

**Files:**
- Create: `frontend/src/pages/RecepcaoPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: Add route and navigation**

```tsx
<Route
  path="/recepcao"
  element={
    <PrivateRoute>
      <RecepcaoPage />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 2: Build summary layout**

```tsx
const [data, setData] = useState(todayIso());

useEffect(() => {
  obterDashboardRecepcao({ data }).then(setDashboard);
}, [data]);

return (
  <Layout>
    <h1>Recepcao</h1>
    <DashboardGrid>
      <AgendaCard items={dashboard.agendaDoDia} />
      <AguardandoCard items={dashboard.aguardando} />
      <ConfirmacoesCard items={dashboard.confirmacoesPendentes} />
      <WhatsappCard items={dashboard.mensagensPendentes} />
      <ListaEsperaCard items={dashboard.listaEspera} />
    </DashboardGrid>
  </Layout>
);
```

- [ ] **Step 3: Add filter controls and empty states**

```tsx
{items.length === 0 ? (
  <div style={emptyCardStyle}>Nenhum item para filtros atuais.</div>
) : (
  items.map(...)
)}
```

- [ ] **Step 4: Add entry point on home screen**

```tsx
<ModuleCard
  to="/recepcao"
  title="Recepcao"
  subtitle="Operacao do dia"
  enabled
/>
```

- [ ] **Step 5: Verify frontend build**

Run: `npm --workspace frontend run build`

Expected: route compiles, no TypeScript errors, reception page bundled.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RecepcaoPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/pages/HomePage.tsx
git commit -m "feat: add reception dashboard page"
```

### Task 6: Add waiting-list management UI

**Files:**
- Create: `frontend/src/components/ListaEsperaForm.tsx`
- Modify: `frontend/src/pages/RecepcaoPage.tsx`
- Modify: `frontend/src/api/lista-espera.ts`

- [ ] **Step 1: Add create form**

```tsx
<ListaEsperaForm
  pacientes={pacientes}
  profissionais={profissionais}
  onSubmit={async (payload) => {
    await criarListaEspera(payload);
    await reload();
  }}
/>
```

- [ ] **Step 2: Add reorder/update actions**

```tsx
await atualizarListaEspera(item.id, {
  prioridade: nextPrioridade,
});
```

- [ ] **Step 3: Add offer/refusal actions**

```tsx
await ofertarVaga(item.id);
await registrarRecusa(item.id, { motivoRecusa });
```

- [ ] **Step 4: Verify main flow manually**

Run:
- `npm run dev:backend`
- `npm run dev:frontend`

Expected:
- Reception creates waiting-list item
- Duplicate active request returns visible error
- Priority update reorders list
- Offer/refusal updates status without full page break

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListaEsperaForm.tsx frontend/src/pages/RecepcaoPage.tsx frontend/src/api/lista-espera.ts
git commit -m "feat: add waiting list management ui"
```

### Task 7: Add test coverage and regression checks

**Files:**
- Modify: `backend/test/lista-espera.e2e-spec.ts`
- Modify: `backend/test/recepcao-dashboard.e2e-spec.ts`
- Optional create: `frontend/src/pages/__tests__/RecepcaoPage.test.tsx`

- [ ] **Step 1: Cover permissions**

```ts
it('doctor cannot access reception dashboard', async () => {
  await request(app.getHttpServer())
    .get('/api/recepcao/dashboard?data=2026-05-14')
    .set('Authorization', `Bearer ${medicoToken}`)
    .expect(403);
});
```

- [ ] **Step 2: Cover ordering rule**

```ts
expect(res.body.data.listaEspera.map((item: any) => item.prioridade)).toEqual([10, 5, 5]);
expect(new Date(res.body.data.listaEspera[1].createdAt).getTime())
  .toBeLessThan(new Date(res.body.data.listaEspera[2].createdAt).getTime());
```

- [ ] **Step 3: Cover dashboard empty state contract**

```ts
expect(res.body.data).toEqual({
  agendaDoDia: [],
  aguardando: [],
  confirmacoesPendentes: [],
  mensagensPendentes: [],
  listaEspera: [],
  generatedAt: expect.any(String),
});
```

- [ ] **Step 4: Run verification suite**

Run:
- `npm --workspace backend run test:e2e -- --runInBand`
- `npm --workspace backend run build`
- `npm --workspace frontend run build`

Expected:
- e2e green
- backend build green
- frontend build green

- [ ] **Step 5: Commit**

```bash
git add backend/test frontend/src/pages/__tests__
git commit -m "test: cover reception and waiting list flows"
```

## Self-Review

**Spec coverage:** This plan covers sprint 5 only, intentionally isolated from sprint 6 panel-TV and sprint 7 reports. Gaps left by design: real-time public panel, call-display screen, Excel/PDF exports.

**Placeholder scan:** No `TODO`/`TBD` placeholders should remain during execution; worker must replace `<timestamp>` with real migration folder name.

**Type consistency:** Keep backend enum names exactly `ListaEsperaStatus.*`; frontend string unions must mirror Prisma enum names 1:1.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-lista-espera-recepcao.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
