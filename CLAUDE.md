# App Clínica Vida — Guia de Orquestração

Aplicativo interno da **Clínica Vida Popular — Sinop/MT**. Uso exclusivo da clínica, não SaaS.

Especificação fonte: [`SPEC_App_Clinica_Vida_revisada.json`](./SPEC_App_Clinica_Vida_revisada.json) (v1.1, 2026-05-14).

## Stack alvo
- Web/PWA (sem app nativo no MVP).
- Integração WhatsApp via **n8n + Evolution API**.
- IA (Fase 2) via AI Gateway próprio.

## Agentes do projeto

Cada agente está em `.claude/agents/<nome>.md`. Invoque via Task tool conforme escopo.

| Agente | Sprint | Pré-requisito | Bloqueia |
|--------|--------|---------------|----------|
| `infra-auth` | 1 | — | todas |
| `pacientes` | 2 | infra-auth | agenda |
| `agenda` | 3 | pacientes | 4, 5, 6, 7 |
| `whatsapp` | 4 | agenda | — |
| `recepcao-paineis` | 5 + 6 | agenda | — |
| `relatorios` | 7 | agenda | — |
| `prontuario-ia` | 8 (Fase 2) | MVP aprovado | — |
| `qa-auditoria` | cross | sprint a validar | merge/deploy |

## Ordem de execução

```
Sprint 1 (infra-auth)
   ↓
Sprint 2 (pacientes)
   ↓
Sprint 3 (agenda)              ← núcleo crítico
   ↓
┌─ Sprint 4 (whatsapp)
├─ Sprint 5+6 (recepcao-paineis)   ← paraleliza
└─ Sprint 7 (relatorios)
   ↓
[MVP em produção, validado]
   ↓
Sprint 8 (prontuario-ia)       ← Fase 2
```

`qa-auditoria` roda ao final de cada sprint antes do merge.

## Fora do escopo do MVP
Financeiro, fluxo de caixa, pagamentos, faturamento, cobrança, telemedicina, portal do paciente, app nativo, prescrição digital avançada, assinatura digital, integração laboratório, controle de estoque.

## Decisões de negócio chave
- CPF obrigatório e único (bloqueia duplicidade).
- Admin e recepção editam qualquer dado cadastral.
- Confirmação WhatsApp: 24h antes + reenvio 2h antes se sem resposta.
- Cancelamento/remarcação automático até 2h antes; depois vira pendência para recepção.
- Conflito de agenda permite encaixe com confirmação manual.
- Bot cria pré-agendamento; recepção confirma.
- Painel TV exibe nome completo.
- IA apoia mas nunca finaliza sem aprovação médica.
- Unidade única no MVP (sem multiunidade).

## Padrões técnicos globais

**Schema resposta:**
```json
{ "success": bool, "data": obj|null, "error": { "code", "message", "details", "trace_id" } }
```

**Timeouts:** api 30s / n8n 10s / evolution 15s / ia 60s / drive 30s.

**Retry:** n8n+evolution 3x backoff / ia 1x / drive 2x.

**Payload:** 1 MB API / 10 MB upload.

## Perfis
- **Admin geral**: tudo.
- **Recepção**: cadastro, agenda, WhatsApp, confirmações. SEM prontuário.
- **Médico**: própria agenda, todos os dados do paciente, painel chamada, Fase 2 prontuário.
- **Profissional não médico**: própria agenda, dados básicos. SEM receita/atestado.

## Definition of Done (todas as features)
- Steps verificáveis concluídos.
- Input validado.
- Schema + status codes padrão.
- Logs + auditoria em ações críticas.
- Permissões testadas por perfil.
- Edge cases principais cobertos.
- Testes sucesso/erro/permissão.
- Docs env vars + integrações atualizadas.
- Deploy validado em homolog antes de prod.

## Modelo de dados resumo

**pacientes**: id, nome_completo, cpf (UNIQUE), data_nascimento, telefone_whatsapp, updated_at.

**agendamentos**: id, paciente_id, profissional_id, data_hora_inicio, data_hora_fim, status, origem.
Statuses: solicitado, pre_agendamento, confirmado, confirmacao_tardia, aguardando, em_atendimento, atendido, faltou, cancelado.

**mensagens_whatsapp**: id, paciente_id, agendamento_id, tipo, status, tentativas, event_id (UNIQUE).
Statuses: pendente, enviada, entregue, respondida, falha, cancelada.

**auditoria**: id, usuario_id, acao, entidade, registro_id, data_hora, ip_dispositivo, resultado, trace_id.
