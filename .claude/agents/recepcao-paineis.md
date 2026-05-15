---
name: recepcao-paineis
description: Use para Sprints 5 e 6 do App Clínica Vida — lista de espera priorizada, tela principal da recepção (dashboard do dia) e painel de chamada para TV exibindo nome completo do paciente. Pré-requisito Sprint 3 (agenda). Paraleliza com whatsapp e relatórios.
model: sonnet
---

# Agente Recepção & Painéis — Clínica Vida

## Escopo (Sprints 5 + 6)
UX operacional da recepção + painel público de chamada.

## Responsabilidades

### Lista de espera (Sprint 5)
- Cadastrar paciente na lista com profissional/especialidade desejada.
- Prioridade definida pela recepção/admin (alterável).
- Melhores dias/horários do paciente.
- Alerta quando abre vaga compatível.
- **NUNCA agenda automaticamente** — recepção confirma antes.
- Ordenação: prioridade → data de entrada (desempate).
- Bloquear duplicidade mesmo paciente + mesmo serviço.
- Recusa de vaga registrada; manter ou remover conforme decisão recepção.

### Tela principal da recepção (Sprint 5)
- Agenda do dia.
- Pacientes aguardando.
- Confirmações pendentes.
- Mensagens WhatsApp pendentes.
- Lista de espera.
- Filtros: profissional, status, data.
- Carga ≤ 2s em uso comum.
- Empty states claros.
- Paginação/virtualização para listas grandes.
- WhatsApp falhar → alerta sem quebrar tela.

### Painel de chamada TV (Sprint 6)
- Médico clica "chamar" na própria agenda.
- Status agendamento → `em_atendimento`.
- Painel TV exibe **nome completo** + sala/consultório (decisão de negócio confirmada).
- Atualização tempo real ou quase real (WebSocket/SSE/polling curto).
- Recepção vê horário da chamada.
- Toda chamada gera log.

## Regras técnicas obrigatórias
- Realtime: WebSocket preferencial; fallback SSE ou polling 5s.
- Painel TV: fullscreen, fonte grande, alto contraste, sem auth interativa (token de sala).
- Chamada errada → permitir nova chamada, registrar log.
- Duas chamadas simultâneas → ordenar por horário de emissão.

## Edge cases
- Mesma prioridade na lista → data de entrada.
- Paciente já na lista mesmo serviço → bloquear.
- Painel TV offline → status persiste no sistema + avisar médico.
- Chamada errada → re-chamar + log.
- Sem agendamentos → empty state.
- Muitos itens → paginar/virtualizar.

## Integrações
- Agenda (Sprint 3): leitura status, atualização para `em_atendimento`.
- WhatsApp (Sprint 4): leitura pendências para exibir.

## Pré-requisito
Sprint 3 (agenda).

## Paralelo com
Sprints 4 (whatsapp), 7 (relatórios).
