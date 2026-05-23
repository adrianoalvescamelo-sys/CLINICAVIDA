# Spec — Frontend Prontuário + Documentos na ficha do paciente

**Data:** 2026-05-23
**Sprint:** 8 (Fase 2) — frontend dos sub-projetos 1 (prontuário base) e 2 (documentos PDF), que já estão prontos no backend.
**Escopo:** UI web (Vite/React) para registrar/consultar evoluções clínicas e emitir/baixar documentos médicos em PDF, integrada à ficha do paciente.

---

## 1. Contexto e motivação

Backends de **prontuário** (`backend/src/prontuario/`) e **documentos PDF** (`backend/src/documentos/`) estão em produção (homolog), mas sem nenhuma interface. Não há como o médico registrar evolução ou emitir receita pela aplicação. Esta spec cobre só o frontend; nenhum endpoint novo é necessário.

## 2. Decisões de produto (brainstorming 2026-05-23)

- **Ponto de entrada:** dentro da ficha do paciente (`/pacientes/:id`).
- **Layout:** página com abas — `Dados | Prontuário | Documentos`.
- **Vínculo de evolução:** evolução exige `agendamentoId` (regra do backend mantida). A criação pela ficha usa um **dropdown dos agendamentos daquele paciente** (`GET /agenda?pacienteId=`).
- **Escopo:** prontuário + documentos juntos numa entrega.

## 3. RBAC (derivado de CLAUDE.md + controllers do backend)

| Perfil | Aba clínica | Ler evoluções | Criar/retificar evolução | Ler documentos | Criar documento |
|---|---|---|---|---|---|
| RECEPCAO | **oculta** | — | — | — | — |
| ADMIN | visível | todas | **não** (só leitura) | todos | **não** |
| MEDICO | visível | todas | sim (retifica só as próprias) | todos | todos os tipos |
| PROFISSIONAL_NAO_MEDICO | visível | **só as próprias** | sim (retifica só as próprias) | **só os próprios** | só PEDIDO_EXAME e ORIENTACOES |

Notas:
- Leitura (prontuário, documentos) liberada a ADMIN/MEDICO/PROFISSIONAL_NAO_MEDICO; **nunca RECEPCAO**.
- Escrita (POST evolução, retificar, POST documento) só MEDICO/PROFISSIONAL_NAO_MEDICO; **nunca ADMIN**.
- RECEITA e ATESTADO só MEDICO (camada extra do service por `ehMedico`).
- A UI **esconde** o que o perfil não pode fazer, mas o backend é a fonte de verdade (403 sempre tratado com mensagem amigável).

## 4. Endpoints consumidos (já existentes)

Prontuário:
- `GET /api/pacientes/:pacienteId/prontuario` → prontuário + lista de evoluções.
- `GET /api/evolucoes/:id` → evolução única.
- `POST /api/pacientes/:pacienteId/prontuario/evolucoes` → cria evolução. Body: `{ agendamentoId, queixaPrincipal?, subjetivo, objetivo, avaliacao, plano }`.
- `POST /api/evolucoes/:id/retificar` → cria nova versão. Body: campos SOAP.

Documentos:
- `GET /api/pacientes/:pacienteId/documentos` → lista (metadados, sem PDF).
- `GET /api/documentos/:id` → metadados de um documento.
- `GET /api/documentos/:id/pdf` → StreamableFile `application/pdf` (download autenticado).
- `POST /api/pacientes/:pacienteId/documentos` → cria. Body: `{ tipo, conteudo, agendamentoId? }`.

Apoio:
- `GET /api/agenda?pacienteId=:id` → agendamentos do paciente (para o dropdown de vínculo).

## 5. Arquitetura frontend

### 5.1 Página do paciente (refator)
`PacienteEditarPage` vira página de abas. Aba ativa controlada por query param `?aba=dados|prontuario|documentos` (default `dados`), permitindo deep-link e sobreviver a refresh.

- `PacienteDadosTab` — o formulário de edição atual extraído sem mudança de comportamento (apenas movido para um componente).
- `ProntuarioTab` — listagem + ações de evolução.
- `DocumentosTab` — listagem + ações de documento.

Abas `Prontuário`/`Documentos` não são montadas nem listadas para RECEPCAO.

### 5.2 Camada de API e tipos
- `frontend/src/api/prontuario.ts` — funções tipadas para os 4 endpoints de prontuário.
- `frontend/src/api/documentos.ts` — funções para os 4 endpoints de documentos; download de PDF.
- `frontend/src/types/prontuario.ts`, `frontend/src/types/documento.ts` — interfaces de domínio (Evolucao, DocumentoMedico, enums de tipo).
- **Helper de download compartilhado** `frontend/src/api/download.ts`: extrai o padrão same-origin `/api` + fetch com Bearer + `URL.createObjectURL` (hoje duplicado em `relatorios.ts`). `relatorios.ts` passa a usar esse helper. Evita repetir o bug do "botão inerte" (URL relativa em `new URL` sem base).

### 5.3 Componentes de UI
- `ProntuarioTab`:
  - lista de evoluções (React Query `['prontuario', pacienteId]`), card por evolução com SOAP, autor, data, agendamento, versão; versões antigas recolhidas/expansíveis, badge "retificada".
  - `<EvolucaoFormModal>` (criar) — dropdown de agendamentos + campos SOAP. Visível a MEDICO/PROFISSIONAL_NAO_MEDICO.
  - `<RetificarEvolucaoModal>` — pré-preenchido; só aparece para o autor na versão atual.
- `DocumentosTab`:
  - tabela de documentos (React Query `['documentos', pacienteId]`) + botão "Baixar PDF" por linha.
  - `<DocumentoFormModal>` (criar) — seletor de tipo + **formulário dinâmico por tipo**; dropdown de agendamento opcional. Tipos RECEITA/ATESTADO ocultos para não-médico.

Formulários dinâmicos de documento (campos por tipo):
- RECEITA: lista editável de medicamentos `{ nome, posologia }` (≥1).
- ATESTADO: `diasAfastamento` (int ≥1), `cid?`, `motivo?`.
- PEDIDO_EXAME: lista de exames (strings, ≥1).
- ORIENTACOES: `texto` (multiline, ≥1 char).

Validações de cliente espelham os limites do backend (TD-DOC-6): motivo ≤500, texto ≤5000, ≤50 itens em listas, cid ≤10. Backend continua sendo a autoridade.

### 5.4 Estado e dados
- `@tanstack/react-query` para fetch/cache/invalidação (mutations invalidam as queries de lista).
- Acesso a perfil via `useAuthStore` (`user.perfil`) para gates de RBAC, no mesmo padrão de `RelatoriosPage`.
- Reuso de `RoleRoute`/checagens inline já existentes; não criar abstração nova de permissão.

## 6. Tratamento de erros

- 403 do backend → toast/alerta "Sem permissão para esta ação" (não deveria ocorrer se o gate de UI estiver correto, mas é defensivo).
- 404 (paciente/documento/evolução) → mensagem inline na aba.
- Falha de download de PDF → alerta "Falha ao gerar/baixar arquivo" (mesmo padrão do helper de download).
- Conflito de retificação (409 VERSAO_NAO_ATUAL) → avisar que a evolução já foi retificada e recarregar a lista.

## 7. Testes (Vitest)

- **RBAC por aba:** RECEPCAO não vê abas clínicas; ADMIN vê sem botões de escrita; não-médico não vê RECEITA/ATESTADO no seletor e não vê evoluções de terceiros.
- **Prontuário:** render da lista; criar evolução (mock API, seleção de agendamento, validação de campos obrigatórios); retificar (pré-preenchido, cria nova versão); cadeia de versões exibida.
- **Documentos:** render da tabela; formulário dinâmico por tipo (campos certos por seleção); criar documento (mock); download PDF dispara fetch same-origin `/api/documentos/:id/pdf` com Bearer.
- **Helper de download:** URL same-origin, header Authorization, não lança com base relativa.
- **Refator de Dados:** a aba Dados preserva o comportamento atual de edição (smoke test do form).

## 8. Fora de escopo (YAGNI)

- Iniciar/encerrar atendimento, mudança de status na agenda a partir daqui (fluxo de atendimento fica para trabalho futuro).
- Edição/exclusão de documento (são imutáveis por design; documento errado → emitir novo).
- IA assistiva (sub-projeto 3).
- Visualização inline do PDF embutido (só download por enquanto).
- Frontend de prontuário fora da ficha do paciente.

## 9. Critérios de aceite

- Médico consegue: ver prontuário, registrar evolução vinculada a um agendamento do paciente, retificar evolução própria, emitir os 4 tipos de documento e baixar o PDF.
- Profissional não médico: idem, exceto RECEITA/ATESTADO; vê só as próprias evoluções/documentos.
- ADMIN: lê prontuário e documentos, sem botões de escrita.
- RECEPÇÃO: não vê as abas clínicas.
- Todos os fluxos cobertos por testes Vitest; lint 0 warnings; build ok.
- Download de PDF funciona em homolog (URL same-origin), sem repetir o bug do botão inerte.
