# Spec — Prontuário base (Sprint 8, sub-projeto 1)

**Data:** 2026-05-22
**Escopo:** Backend (API + testes). Frontend e os sub-projetos *Documentos PDF* e
*IA assistiva* são projetos separados (decomposição da Sprint 8).
**Risco:** alto (dados clínicos sensíveis, LGPD).
**Pré-requisito:** MVP operacional (Sprints 1–7) — atendido.

## Objetivo

Prontuário eletrônico estruturado por paciente, com evoluções clínicas no formato
SOAP vinculadas a agendamentos, retificação versionada (sem exclusão), RBAC
clínico rigoroso e auditoria inclusive de **visualização**.

## Decisões (brainstorming 2026-05-22)

1. Evolução vinculada ao **Agendamento existente** (encaixe já gera agendamento → cobre urgências).
2. Conteúdo em **SOAP** (Subjetivo, Objetivo, Avaliação, Plano) + queixa principal opcional.
3. **Profissional não médico**: cria a própria evolução; **não lê** evoluções de outros; vê dados básicos do paciente.
4. **Médico**: lê **todas** as evoluções (de qualquer profissional); cria; retifica as próprias.
5. **Admin geral**: lê tudo como médico; **não cria** (não é autor clínico).
6. **Recepção**: 403 em toda rota clínica.
7. Modelo **append-only + cadeia de versão** (retificação cria nova linha; original intacto).

## Modelo de dados (Prisma — `backend/prisma/schema.prisma`)

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
  id              String       @id @default(uuid()) @db.Uuid
  prontuarioId    String       @map("prontuario_id") @db.Uuid
  agendamentoId   String       @map("agendamento_id") @db.Uuid
  autorUsuarioId  String       @map("autor_usuario_id") @db.Uuid
  autorEhMedico   Boolean      @map("autor_eh_medico")          // snapshot na criação
  queixaPrincipal String?      @map("queixa_principal")
  subjetivo       String
  objetivo        String
  avaliacao       String
  plano           String
  versao          Int          @default(1)
  replacesId      String?      @unique @map("replaces_id") @db.Uuid  // aponta p/ evolução substituída
  createdAt       DateTime     @default(now()) @map("created_at")
  // SEM updatedAt / deletedAt — imutável

  prontuario   Prontuario @relation(fields: [prontuarioId], references: [id])
  agendamento  Agendamento @relation(fields: [agendamentoId], references: [id])
  autor        Usuario     @relation(fields: [autorUsuarioId], references: [id])
  replaces     Evolucao?   @relation("Retificacao", fields: [replacesId], references: [id])
  replacedBy   Evolucao?   @relation("Retificacao")

  @@index([prontuarioId, createdAt])
  @@index([autorUsuarioId])
  @@map("evolucoes")
}
```
Relações inversas a adicionar: `Paciente.prontuario Prontuario?`, `Agendamento.evolucoes Evolucao[]`, `Usuario.evolucoes Evolucao[]`.

**"Evolução atual"** = evolução cujo `id` não é `replacesId` de nenhuma outra
(equivalente: `replacedBy == null`). Listagens retornam as atuais; a cadeia
completa de versões fica disponível no detalhe.

## Endpoints

Prefixo global `/api`. Todas as rotas clínicas exigem JWT + `@Roles`.

| Método | Rota | Perfis | Descrição |
|---|---|---|---|
| GET | `/pacientes/:pacienteId/prontuario` | MÉDICO, ADMIN, NÃO-MÉDICO* | Prontuário + evoluções atuais (*não-médico só as próprias) |
| GET | `/evolucoes/:id` | MÉDICO, ADMIN, NÃO-MÉDICO* | Evolução + cadeia de versões (*não-médico só se autor) |
| POST | `/pacientes/:pacienteId/prontuario/evolucoes` | MÉDICO, NÃO-MÉDICO | Cria evolução (autor = usuário atual) |
| POST | `/evolucoes/:id/retificar` | autor da evolução | Cria nova versão |

RECEPÇÃO → 403 (RolesGuard, não listada em `@Roles`).

### Bodies
- **Criar evolução**: `{ agendamentoId, queixaPrincipal?, subjetivo, objetivo, avaliacao, plano }`. Valida que o agendamento existe e pertence ao `pacienteId`. Prontuário criado lazy se ainda não existir.
- **Retificar**: `{ queixaPrincipal?, subjetivo, objetivo, avaliacao, plano }`. Cria `Evolucao` com `replacesId = :id`, `versao = original.versao + 1`, mesmo `prontuarioId`/`agendamentoId`/autor.

### Regras de autor
- `autorUsuarioId` = usuário autenticado. `autorEhMedico` = snapshot (via `Profissional.ehMedico` vinculado ao usuário; se não houver profissional vinculado e perfil for MÉDICO, true).
- Retificar: somente `autorUsuarioId === currentUser.id` → senão **403**.
- ADMIN não cria nem retifica (não é autor clínico) → **403** nessas rotas.

## RBAC — resumo

| Perfil | Ler todas | Ler próprias | Criar | Retificar (própria) |
|---|---|---|---|---|
| ADMIN | ✅ | ✅ | ❌ | ❌ |
| MÉDICO | ✅ | ✅ | ✅ | ✅ |
| PROFISSIONAL_NÃO_MÉDICO | ❌ | ✅ | ✅ | ✅ |
| RECEPÇÃO | ❌ | ❌ | ❌ | ❌ (403) |

Filtro de leitura para não-médico: `where autorUsuarioId = currentUser.id`.

## Auditoria (LGPD)

`AuditService.log()` em **toda** operação, incluindo leitura:
- `VISUALIZACAO_PRONTUARIO` (GET prontuário)
- `VISUALIZACAO_EVOLUCAO` (GET evolução)
- `CRIACAO_EVOLUCAO`
- `RETIFICACAO_EVOLUCAO`

Cada log: `usuarioId`, `entidade` (`Prontuario`/`Evolucao`), `registroId`,
`resultado` (SUCESSO/FALHA/NEGADO), `ipDispositivo`, `traceId`, `detalhes`.
Acesso negado por RBAC também audita `NEGADO` quando aplicável.

## Transação e integridade

- Criar/retificar dentro de `prisma.$transaction`: (lazy-create Prontuario) +
  insert Evolucao + audit SUCESSO. Falha no meio → **rollback completo**.
- Evolução é imutável: nenhuma rota faz UPDATE/DELETE de `evolucoes`.

## Edge cases

| Caso | Resposta |
|---|---|
| Recepção acessa rota clínica | 403 |
| Usuário sem perfil clínico | 403 |
| Paciente inexistente | 404 |
| `agendamentoId` não pertence ao paciente | 400 |
| Retificar versão já substituída (não-atual) | 409 |
| Retificar evolução de outro autor | 403 |
| Não-médico tenta ler evolução de outro | 404 (filtrada) |
| Falha de DB no save | rollback, 500 com envelope padrão |

## Estrutura de código

Novo módulo `backend/src/prontuario/`:
- `prontuario.module.ts`
- `prontuario.controller.ts` (rotas acima, `@Roles`, `@CurrentUser`, `@Req` p/ trace_id+ip)
- `prontuario.service.ts` (regras, RBAC de leitura, transações, audit)
- `dto/criar-evolucao.dto.ts`, `dto/retificar-evolucao.dto.ts` (class-validator)

Reusa: `PrismaService`, `AuditService`, decorators `@Roles`/`@CurrentUser`,
`ResponseInterceptor` (envelope), `AllExceptionsFilter`.

## Testes (TDD)

- **Unit** (`prontuario.service.spec.ts`, Prisma/Audit mockados): criação, snapshot autorEhMedico, filtro de leitura não-médico, retificação (versão+replacesId), retificar não-atual (409), retificar de terceiro (403), agendamento de outro paciente (400), rollback em falha de DB, audit chamado em cada operação (incl. visualização).
- **e2e** (`prontuario.e2e-spec.ts`, DB real): matriz RBAC por perfil (ADMIN/MÉDICO/NÃO-MÉDICO/RECEPÇÃO), criação→leitura→retificação ponta a ponta, não-médico não vê alheia, recepção 403, registros em `auditoria` (visualização + alteração).

## Fora deste sub-projeto (YAGNI aqui)

- Frontend / telas de prontuário.
- Documentos médicos PDF (sub-projeto 2).
- IA assistiva / AI Gateway (sub-projeto 3).
- Consentimentos.
