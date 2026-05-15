# Progresso - App Clinica Vida

Atualizado em: 2026-05-14

## Estado Geral

Projeto interno da Clinica Vida Popular - Sinop/MT.

Stack:
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript
- Integracoes: WhatsApp via n8n/Evolution API

Observacao importante:
- A pasta atual nao tem repositorio Git inicializado.
- Os passos de commit planejados nao foram executados por ausencia de `.git`.

## O Que Ja Existe

Backend:
- Auth com login, JWT, lockout e auditoria.
- Health/readiness.
- Perfis e guards por papel.
- Pacientes.
- Profissionais.
- Agenda/agendamentos.
- Bloqueios de agenda.
- WhatsApp e bot.
- Lista de espera.
- Dashboard operacional da recepcao.

Frontend:
- Login.
- Layout autenticado.
- Pacientes.
- Agenda.
- WhatsApp pendentes.
- Recepcao/dashboard operacional.
- Gestao basica da lista de espera dentro da tela de recepcao.

## Sprint 5 Implementado

Sprint 5 - Lista de espera e recepcao operacional.

Arquivos principais:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260514201000_lista_espera/migration.sql`
- `backend/src/lista-espera/*`
- `backend/src/recepcao/*`
- `backend/test/lista-espera.e2e-spec.ts`
- `backend/test/recepcao-dashboard.e2e-spec.ts`
- `frontend/src/api/lista-espera.ts`
- `frontend/src/api/recepcao.ts`
- `frontend/src/types/lista-espera.ts`
- `frontend/src/types/recepcao.ts`
- `frontend/src/components/ListaEsperaForm.tsx`
- `frontend/src/pages/RecepcaoPage.tsx`

Funcionalidades entregues:
- Modelo Prisma `ListaEspera`.
- Enum `ListaEsperaStatus`.
- Migration com indice unico parcial para impedir duplicidade ativa/contatada.
- API `POST /api/lista-espera`.
- API `GET /api/lista-espera`.
- API `PATCH /api/lista-espera/:id`.
- API `POST /api/lista-espera/:id/ofertar-vaga`.
- API `POST /api/lista-espera/:id/registrar-recusa`.
- API `POST /api/lista-espera/:id/marcar-agendado`.
- API `GET /api/recepcao/dashboard`.
- Dashboard da recepcao com agenda do dia, aguardando, confirmacoes pendentes, WhatsApp pendente e lista de espera.
- Formulario para adicionar paciente na lista de espera.
- Acoes de prioridade, oferta, recusa e agendado.

Cuidados tecnicos implementados:
- `NULLS NOT DISTINCT` no indice unico parcial da lista de espera para evitar duplicidade com campos opcionais.
- Mapeamento de `P2002` do Prisma para `409 LISTA_ESPERA_DUPLICADA`.
- Bloqueio de transicoes a partir de status finais da lista de espera.
- `PATCH` da lista de espera aplica invariantes de status e timestamps.
- Dashboard da recepcao calcula dia local em `America/Cuiaba`.
- Mensagens pendentes no dashboard sao filtradas pelo dia/profissional do agendamento relacionado.
- Lista de espera no dashboard limitada com `take: 100`.

## Sprint 6 Implementado

Sprint 6 - Painel de chamada / Painel TV.

Arquivos principais:
- `backend/src/recepcao/recepcao.service.ts`
- `backend/test/recepcao-dashboard.e2e-spec.ts`
- `frontend/src/api/agenda.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/AgendaPage.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/PainelTVPage.tsx`
- `frontend/src/pages/RecepcaoPage.tsx`
- `frontend/src/types/recepcao.ts`
- `frontend/src/utils/clinic-date.ts`
- `frontend/src/utils/clinic-date.test.ts`

Funcionalidades entregues:
- Dashboard da recepcao passou a expor `emAtendimento`.
- Agenda do dia exibe o bloco de pacientes em atendimento.
- Acao `POST /api/agendamentos/:id/chamar` fica acessivel na agenda para status `AGUARDANDO`.
- Acao `POST /api/agendamentos/:id/atendido` fica acessivel na agenda para status `EM_ATENDIMENTO`.
- Novo painel `/painel-tv` com atualizacao automatica por polling.
- Home e menu autenticado passaram a expor o Painel TV.
- Utilitario compartilhado de data/hora da clinica com teste unitario frontend.

## Verificacoes Executadas

Passaram:
- `npm --workspace backend run build`
- `npm --workspace backend run test:e2e -- --runInBand --testTimeout=30000` com `.env` carregado
- `npm --workspace frontend run build`
- `npm --workspace frontend run test`

Resultado e2e final:
- 3 suites passaram.
- 15 testes passaram.

Observacao:
- O teste antigo de health em `backend/test/auth.e2e-spec.ts` foi ajustado para o schema envelopado atual `{ success, data, error }`.

## Banco Local

Postgres local via Docker estava rodando e saudavel.

Migration aplicada:
- `20260514201000_lista_espera`

Comando usado para deploy local carregando `.env` da raiz:

```powershell
$envLines = Get-Content .env; foreach ($line in $envLines) { $trim = $line.Trim(); if ($trim -and -not $trim.StartsWith('#')) { $idx = $trim.IndexOf('='); if ($idx -gt 0) { $name = $trim.Substring(0,$idx); $value = $trim.Substring($idx+1); Set-Item -Path "Env:$name" -Value $value } } }; npm --workspace backend run prisma:deploy
```

## Pendencias Do MVP

Proximos sprints provaveis:
- Sprint 7: Relatorios operacionais.

Tambem pendente:
- Teste manual ponta a ponta com frontend e backend rodando.
- Revisao final de UX.
- Revisao de variaveis de ambiente/deploy/homologacao.
- Inicializar Git, se desejado.

## Proximo Ponto De Retomada

Continuar pelo Sprint 7:
- Relatorios operacionais do MVP.
- Exportacao e filtros por periodo/profissional.
- Validacao de permissao por perfil.
