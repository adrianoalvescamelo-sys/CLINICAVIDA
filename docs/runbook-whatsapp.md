# Runbook — Ativação gradual do WhatsApp

Procedimento para ligar o envio automático de mensagens WhatsApp em produção
**sem risco de disparar para todos os pacientes de uma vez**.

A integração usa n8n + Evolution API. O backend enfileira e dispara mensagens
(confirmação 24h, lembrete 2h, etc.) via cron a cada 10 min.

## Variáveis de controle

| Variável | Efeito |
|---|---|
| `WA_ENABLED` | Liga/desliga todo o subsistema. `false` = nada é enfileirado nem enviado. |
| `WA_DRY_RUN` | `true` = loga o payload e marca como ENVIADA, **sem** chamar o n8n. |
| `WA_ALLOWLIST` | Números (só dígitos, vírgula). Preenchido = **só** esses recebem real; resto vira dry-run. Vazio = sem restrição. Casa por sufixo (DDI opcional). |
| `N8N_WEBHOOK_URL` | URL do workflow n8n. Vazio também força dry-run. |

Precedência do dry-run efetivo (em `WhatsappService.enviar`):
`dryRun = WA_DRY_RUN global OU (allowlist preenchida E número fora dela) OU sem webhook`.

---

## Fase 1 — Validação seca (DRY-RUN)

Objetivo: confirmar que o cron seleciona os agendamentos certos e monta os
templates corretos, sem enviar nada.

```
WA_ENABLED=true
WA_DRY_RUN=true
WA_ALLOWLIST=
N8N_WEBHOOK_URL=https://<n8n>/webhook/clinicavida-outbound
```

1. Suba/reinicie a API com essas vars.
2. Cadastre 1-2 agendamentos de teste com data ~24h à frente.
3. Aguarde o cron (até 10 min) ou observe os logs.
4. Procure nos logs: `WhatsApp DRY-RUN — pulando envio HTTP` com `motivoDryRun: "global"`.
   - Confira `to` (telefone), `tipo`, `texto` no log.
5. Critério de saída: payloads corretos, telefones corretos, nenhum erro.

> Em dry-run a mensagem fica com status ENVIADA no banco/tela WhatsApp — esperado.

---

## Fase 2 — Envio real restrito (ALLOWLIST)

Objetivo: validar o caminho real (n8n → Evolution → WhatsApp) usando apenas
números da equipe.

```
WA_ENABLED=true
WA_DRY_RUN=false
WA_ALLOWLIST=5566999990001,5566999990002   # celulares da equipe
N8N_WEBHOOK_URL=https://<n8n>/webhook/clinicavida-outbound
```

1. Reinicie a API.
2. Cadastre um agendamento de teste cujo paciente tenha um número **da allowlist**.
3. Cadastre outro com número **fora** da allowlist.
4. Verifique:
   - Número da allowlist: chega WhatsApp real; log sem `motivoDryRun`.
   - Número fora: log `motivoDryRun: "allowlist"`, nada enviado.
5. Responda SIM/NÃO no WhatsApp da equipe e confirme que o agendamento muda
   de status (CONFIRMADO / CANCELADO conforme regra 2h).
6. Critério de saída: envio real ok, resposta processada, números fora bloqueados.

---

## Fase 3 — Produção plena

```
WA_ENABLED=true
WA_DRY_RUN=false
WA_ALLOWLIST=
```

1. Reinicie a API.
2. Monitore a tela **WhatsApp** (pendentes/falhas) e os logs nas primeiras horas.
3. Acompanhe a tabela `auditoria` para `WHATSAPP_FALHOU` / `WHATSAPP_FALHA_CALLBACK`.

---

## Rollback rápido

Se algo sair errado em qualquer fase:

```
WA_DRY_RUN=true        # corta envios na hora (próximo ciclo do cron)
# ou
WA_ENABLED=false       # desliga tudo
```

Reinicie a API. Mensagens já enfileiradas em PENDENTE não são reenviadas
enquanto dry-run/disabled. Não há disparo retroativo ao religar — o cron só
pega agendamentos dentro da janela de tempo atual.

---

## Verificações úteis

- **Logs dry-run:** procure `motivoDryRun` (`global` | `allowlist` | `sem-webhook`).
- **Falhas:** status FALHA na tela WhatsApp; reenvio manual disponível ali.
- **Retry automático:** cron `wa-retry-fila` a cada 2 min, backoff exponencial
  até `WA_MAX_TENTATIVAS` (3).
- **Idempotência:** cada mensagem tem `eventId` único (`conf24-<id>`,
  `lemb2-<id>`); reprocessar não duplica.
