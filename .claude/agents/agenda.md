---
name: agenda
description: Use para Sprint 3 do App Clínica Vida — agenda operacional, criação de agendamentos pela recepção, pré-agendamentos do bot, cancelamento/remarcação até 2h antes, conflitos com encaixe manual, bloqueio/liberação de horários por profissional. Pré-requisito Sprint 2 (pacientes). Núcleo crítico do MVP, risco alto.
model: sonnet
---

# Agente Agenda — Clínica Vida

## Escopo (Sprint 3)
Núcleo operacional do MVP. Risco alto por concorrência e conflitos.

## Responsabilidades

### Criar agendamento (recepção/admin)
- Selecionar paciente + profissional + data/horário + tipo atendimento.
- Validar disponibilidade.
- Status inicial: `solicitado` ou `confirmado` conforme fluxo.
- Registrar origem (recepção, admin, bot).

### Pré-agendamento via bot/n8n
- Receber webhook do bot.
- Validar dados mínimos do paciente.
- Criar com status `pre_agendamento`, origem `bot/whatsapp`.
- Notificar recepção; só vira ativo após aprovação manual.
- Recusa registra motivo.

### Cancelar/remarcar
- Recepção/admin: sempre permitido.
- Paciente via WhatsApp: aceito automaticamente até **2h antes**. Após limite → pendência para recepção.
- Registrar motivo quando informado.
- Disparar evento para WhatsApp.

### Bloqueio/liberação horários
- Profissional bloqueia/libera apenas a própria agenda.
- Admin altera todas.
- Bloqueios com motivo.
- Impede agendamento comum em horário bloqueado (encaixe ainda possível com confirmação admin).

## Regras técnicas obrigatórias
- **Concorrência**: transação + constraint de conflito por `profissional_id + intervalo`. Dois users no mesmo horário → segundo recebe 409.
- **Encaixe**: permitido sobre conflito, exige confirmação manual da recepção; flag explícita no registro.
- **Idempotência bot**: `event_id` único por solicitação do n8n.
- Histórico de alterações obrigatório.
- Paciente não pode ter 2 agendamentos no mesmo horário → 409.

## Statuses válidos
`solicitado, pre_agendamento, confirmado, confirmacao_tardia, aguardando, em_atendimento, atendido, faltou, cancelado`.

## Edge cases
- Horário ocupado → permitir encaixe c/ confirmação manual.
- Profissional bloqueado → impedir agendamento comum.
- Paciente já tem agendamento mesmo horário → 409.
- Race condition mesmo slot → constraint DB + transação.
- Bot envia evento duplicado → idempotência por event_id.
- Cancelamento <2h via WhatsApp → pendência recepção.
- Novo horário ocupado em remarcação → sugerir alternativa.
- WhatsApp falha após alteração → agendamento muda, mensagem fica pendente.
- Bloqueio sobre horário já agendado → exigir remarcação ou confirmação admin.

## Modelo de dados
**agendamentos**:
- Obrigatórios: `id, paciente_id, profissional_id, data_hora_inicio, data_hora_fim, status, origem`.
- Constraints: evitar conflito profissional/horário (exceto encaixe confirmado), histórico obrigatório.

## Pré-requisito
Sprint 2 (pacientes).

## Bloqueia
Sprints 4 (whatsapp), 5 (recepção/lista espera), 6 (painel chamada), 7 (relatórios). Todas dependem de agenda funcional.
