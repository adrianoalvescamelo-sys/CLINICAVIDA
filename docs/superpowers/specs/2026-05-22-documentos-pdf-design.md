# Spec — Documentos médicos PDF (Sprint 8, sub-projeto 2)

**Data:** 2026-05-22
**Escopo:** Backend (API + testes). Frontend é projeto separado.
**Risco:** alto (documentos clínicos com valor legal, LGPD).
**Pré-requisito:** Prontuário base (sub-projeto 1) — concluído.

## Objetivo

Geração de documentos médicos em PDF (receita simples, atestado, pedido de
exame, orientações) com identidade visual da Clínica Vida, RBAC por tipo de
documento, preservação imutável do PDF emitido e auditoria de geração,
visualização e download.

## Decisões (brainstorming 2026-05-22)

1. **Preservação**: guardar os campos estruturados **E** o PDF gerado (bytes, `bytea`). Documento emitido é imutável mesmo se o template mudar.
2. **Tipos + geração (RBAC)**: RECEITA e ATESTADO → só MÉDICO; PEDIDO_EXAME e ORIENTACOES → MÉDICO + PROFISSIONAL_NAO_MEDICO. Recepção e Admin não geram.
3. **Conteúdo estruturado por tipo** (JSON validado).
4. **Leitura/download**: MÉDICO+ADMIN todos; NÃO-MÉDICO só os próprios; RECEPÇÃO 403.
5. **Imutável**: sem update/delete. Documento errado → emite um novo.

## Modelo de dados (Prisma — `backend/prisma/schema.prisma`)

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
  // SEM updatedAt / deletedAt — imutável

  paciente    Paciente     @relation(fields: [pacienteId], references: [id])
  autor       Usuario      @relation(fields: [autorUsuarioId], references: [id])
  agendamento Agendamento? @relation(fields: [agendamentoId], references: [id])

  @@index([pacienteId, createdAt])
  @@index([autorUsuarioId])
  @@map("documentos_medicos")
}
```
Relações inversas: `Paciente.documentos DocumentoMedico[]`, `Usuario.documentos DocumentoMedico[]`, `Agendamento.documentos DocumentoMedico[]`.

## Conteúdo por tipo (validado no service; armazenado em `conteudo` JSON)

| Tipo | Campos |
|---|---|
| ATESTADO | `diasAfastamento` (int ≥1), `cid?` (string), `motivo?` (string) |
| RECEITA | `medicamentos`: lista não-vazia de `{ nome, posologia }` |
| PEDIDO_EXAME | `exames`: lista não-vazia de strings |
| ORIENTACOES | `texto` (string não-vazia) |

Validação inválida para o tipo → **400** (`CONTEUDO_INVALIDO`).

## Endpoints

| Método | Rota | Perfis (controller `@Roles`) | Descrição |
|---|---|---|---|
| POST | `/pacientes/:pacienteId/documentos` | MÉDICO, NÃO-MÉDICO | Gera documento + PDF (RBAC por tipo no service) |
| GET | `/pacientes/:pacienteId/documentos` | MÉDICO, ADMIN, NÃO-MÉDICO* | Lista metadados (*não-médico só próprios) |
| GET | `/documentos/:id` | MÉDICO, ADMIN, NÃO-MÉDICO* | Metadados (*só próprios) |
| GET | `/documentos/:id/pdf` | MÉDICO, ADMIN, NÃO-MÉDICO* | Download PDF (StreamableFile) |

RECEPÇÃO → 403 (não listada em `@Roles`).

### Body POST
`{ tipo: TipoDocumento, agendamentoId?: uuid, conteudo: object }`.
- Se `agendamentoId` informado, valida que pertence ao `pacienteId` (senão 400).
- `autorUsuarioId` = usuário atual; `autorEhMedico` = snapshot (via Profissional.ehMedico por usuarioId, ou perfil MEDICO).

### RBAC de geração por tipo (no service)
- `RECEITA`/`ATESTADO`: exige `autorEhMedico === true` (ou perfil MEDICO). Não-médico → **403** (`PERFIL_NAO_AUTORIZADO_DOCUMENTO`).
- `PEDIDO_EXAME`/`ORIENTACOES`: MÉDICO ou NÃO-MÉDICO.
- ADMIN não gera (não está em `@Roles` do POST) → 403.

### Resposta
POST/GET metadados retornam o documento **sem** o campo `pdf` (bytes) — só metadados (`id, tipo, conteudo, pacienteId, autorUsuarioId, autorEhMedico, agendamentoId, createdAt`). O PDF vem só pela rota `/pdf`.

## RBAC de leitura/download

| Perfil | Gerar exame/orient. | Gerar receita/atestado | Ler/baixar todos | Ler/baixar próprios |
|---|---|---|---|---|
| ADMIN | ❌ | ❌ | ✅ | ✅ |
| MÉDICO | ✅ | ✅ | ✅ | ✅ |
| NÃO-MÉDICO | ✅ | ❌ (403) | ❌ | ✅ |
| RECEPÇÃO | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |

Filtro de leitura não-médico: `where autorUsuarioId = currentUser.id`.

## Geração de PDF

- `pdfkit` (já no projeto; reuso do padrão de `relatorios.service.ts`).
- Layout: header `Clínica Vida Popular — Sinop/MT` + título do tipo + nome do paciente + nome do autor + data + corpo específico do tipo + linha de assinatura do profissional.
- Gera o `Buffer` **antes** de persistir. Persistência (insert com `pdf` bytea) + audit dentro de `prisma.$transaction` → rollback em falha.
- Falha na geração do PDF → 500 (`PDF_FALHA`), nada é salvo; cliente pode repetir.
- Download: `GET /documentos/:id/pdf` retorna `StreamableFile` com `Content-Type: application/pdf` e `Content-Disposition: inline; filename="<tipo>-<id>.pdf"`.

## Auditoria (LGPD)

`AuditService.log()` em:
- `GERACAO_DOCUMENTO` (POST)
- `VISUALIZACAO_DOCUMENTO` (GET metadados — get/list)
- `DOWNLOAD_DOCUMENTO` (GET /pdf)

Cada log: `usuarioId`, `entidade='DocumentoMedico'`, `registroId`, `resultado`, `ipDispositivo`, `traceId`, `detalhes` (ex.: `{ tipo }`).

## Edge cases

| Caso | Resposta |
|---|---|
| Recepção em qualquer rota | 403 |
| Não-médico gera receita/atestado | 403 |
| Admin gera documento | 403 |
| Paciente inexistente | 404 |
| `agendamentoId` não pertence ao paciente | 400 |
| `conteudo` inválido para o tipo | 400 |
| Documento inexistente | 404 |
| Não-médico lê/baixa documento de outro | 404 (filtrado) |
| Falha ao gerar PDF | 500, nada salvo |

## Estrutura de código

Novo módulo `backend/src/documentos/`:
- `documentos.module.ts`
- `documentos.controller.ts` (rotas, `@Roles`, `@CurrentUser`, ip/trace, `StreamableFile`)
- `documentos.service.ts` (RBAC por tipo, validação de conteúdo, geração PDF, transação, audit, filtro de leitura)
- `documentos.pdf.ts` (renderers pdfkit por tipo — função pura `tipo, dados → (doc) => void`)
- `dto/criar-documento.dto.ts` (tipo + agendamentoId? + conteudo)

Reusa: `PrismaService`, `AuditService`, decorators `@Roles`/`@CurrentUser`, padrão `StreamableFile` de `relatorios.controller.ts`.

## Testes (TDD)

- **Unit** (`documentos.service.spec.ts`, Prisma/Audit mockados): geração de cada tipo, snapshot autorEhMedico, RBAC por tipo (não-médico+receita→403), validação de conteúdo inválido (400), agendamento de outro paciente (400), filtro de leitura não-médico, download de outro→404, audit chamado em geração/visualização/download, rollback em falha.
- **Unit PDF** (`documentos.pdf.spec.ts`): cada renderer produz Buffer não-vazio começando com `%PDF`.
- **e2e** (`documentos.e2e-spec.ts`, DB real): matriz RBAC (gerar por tipo e perfil), geração→listagem→download (Content-Type application/pdf, corpo começa com `%PDF`), não-médico não vê alheio, recepção 403, registros em `auditoria`.

## Fora deste sub-projeto (YAGNI aqui)

- Frontend / telas de documentos.
- IA assistiva (sub-projeto 3).
- Cancelamento/invalidação de documento (doc errado → emite novo).
- Numeração sequencial oficial / assinatura digital (fora do escopo MVP).
- Armazenamento externo (object storage) — bytea no DB basta nesta escala.
