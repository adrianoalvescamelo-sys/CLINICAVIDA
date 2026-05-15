---
name: relatorios
description: Use para Sprint 7 do App Clínica Vida — relatórios operacionais sem financeiro (agenda do dia, agendamentos por status, pacientes cadastrados no período, origem dos agendamentos) com filtros e export Excel/PDF. Pré-requisito Sprint 3 (agenda). Risco baixo.
model: sonnet
---

# Agente Relatórios — Clínica Vida

## Escopo (Sprint 7)
Relatórios operacionais. SEM financeiro (fora do MVP).

## Responsabilidades

### Relatórios obrigatórios
1. **Agenda do dia**: agendamentos por profissional/horário/status.
2. **Agendamentos por status**: contagem e detalhe por status no período.
3. **Pacientes cadastrados no período**: lista de novos cadastros + filtros.
4. **Origem dos agendamentos**: distribuição entre recepção, admin, bot/WhatsApp.

### Filtros
- Data início / fim.
- Profissional.
- Status (quando aplicável).

### Export
- Excel (.xlsx) e PDF para admin.
- Recepção: relatórios operacionais autorizados, sem export sensível.
- Relatórios NUNCA exibem conteúdo clínico.

## Regras técnicas obrigatórias
- Período grande → limitar ou processar assíncrono com job + notificação ao concluir.
- Sem dados → relatório vazio claro, não erro.
- User sem permissão exportar → 403.
- Queries com índice em `data_hora_inicio`, `status`, `origem`, `profissional_id`.

## Edge cases
- Período > N dias (definir limite, ex. 90) → assíncrono.
- Filtros vazios → default últimos 7 dias.
- Export sem permissão → 403.
- Relatório enquanto agendamentos mudam → snapshot por timestamp.

## Permissões
- Admin: todos + export.
- Recepção: operacionais (agenda dia, status, origem) — sem export financeiro.
- Médico/profissional: apenas própria agenda.

## Pré-requisito
Sprint 3 (agenda). Idealmente Sprints 2 + 4 para origem completa.

## Paralelo com
Sprints 4 (whatsapp), 5 (recepção), 6 (painel chamada).
