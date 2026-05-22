# Fase 2 WhatsApp — setup n8n + Evolution (homolog)

Liga o caminho real **backend → n8n → Evolution API → WhatsApp** e o retorno
**WhatsApp → Evolution → n8n → backend**, restrito por allowlist (ver
[`docs/runbook-whatsapp.md`](../runbook-whatsapp.md)).

## Topologia — comunicação por rede Docker interna

As URLs **públicas** (`*.srv1477984.hstgr.cloud`) **não funcionam de dentro da
VPS** (hairpin NAT falha → HTTP 000). Então backend, n8n e Evolution se falam
por **DNS interno do Docker**, conectando os containers às redes uns dos outros.

```
backend (clinicavida-api-homolog:3000)
  → POST n8n http://n8n-upbl-n8n-1:5678/webhook/clinicavida-outbound
      → POST Evolution http://evolution-api-vyes-api-1:8080/message/sendText/clinicavida → WhatsApp
      → POST backend http://clinicavida-api-homolog:3000/api/bot/whatsapp/status

WhatsApp → Evolution (MESSAGES_UPSERT)
  → POST n8n http://n8n-upbl-n8n-1:5678/webhook/clinicavida-inbound
      → POST backend http://clinicavida-api-homolog:3000/api/bot/whatsapp/inbound
```

Containers / portas internas:
- backend: `clinicavida-api-homolog:3000` (rede `clinicavida-homolog_clinicavida-net`)
- n8n: `n8n-upbl-n8n-1:5678` (rede `n8n-upbl_default`)
- Evolution v2.3.7: `evolution-api-vyes-api-1:8080` (rede `evolution-api-vyes_default`), instância `clinicavida` pareada ao número `5517982056029`

> Os JSONs já embutem `apikey` da Evolution e `x-bot-secret` do backend
> (segredos de homolog). Se rotacionar, reeditar os 2 workflows.

## 0. Conectar as redes Docker (uma vez)

```bash
sudo docker network connect n8n-upbl_default            clinicavida-api-homolog   # api -> n8n
sudo docker network connect evolution-api-vyes_default  n8n-upbl-n8n-1            # n8n -> evolution
sudo docker network connect clinicavida-homolog_clinicavida-net n8n-upbl-n8n-1   # n8n -> backend
sudo docker network connect n8n-upbl_default            evolution-api-vyes-api-1 # evolution -> n8n
```

Verificar (deve retornar `{"status":"ok"}` / JSON):
```bash
sudo docker exec clinicavida-api-homolog wget -qO- http://n8n-upbl-n8n-1:5678/healthz
sudo docker exec n8n-upbl-n8n-1 wget -qO- http://evolution-api-vyes-api-1:8080/
sudo docker exec n8n-upbl-n8n-1 wget -qO- http://clinicavida-api-homolog:3000/ready
sudo docker exec evolution-api-vyes-api-1 wget -qO- http://n8n-upbl-n8n-1:5678/healthz
```

> **Persistência:** a conexão api↔n8n está fixada no `docker-compose.homolog.yml`
> (rede externa `n8n-upbl_default`), então sobrevive a recreate da API. As
> conexões dos containers `n8n-upbl-n8n-1` e `evolution-api-vyes-api-1` são
> runtime — se essas stacks forem recriadas, **rodar os connects de novo**.

## 1. Importar os workflows no n8n

UI n8n → **Workflows → Import from File**:
1. [`clinicavida-outbound.json`](./clinicavida-outbound.json)
2. [`clinicavida-inbound.json`](./clinicavida-inbound.json)

Após importar, **ativar** cada um (toggle "Active"). A URL de produção do
webhook (`/webhook/<path>`) só responde com o workflow **Active**.

## 2. Apontar a Evolution para o n8n inbound (URL interna)

Rodar **na VPS** (usa `127.0.0.1:32778` — a pública dá HTTP 000):

```bash
curl -X POST 'http://127.0.0.1:32778/webhook/set/clinicavida' \
  -H 'apikey: e9OrBMZNDCB2d4E1K8CZyCTss6yoxye7' \
  -H 'Content-Type: application/json' \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://n8n-upbl-n8n-1:5678/webhook/clinicavida-inbound",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

## 3. Backend: apontar para o n8n e sair do dry-run

No `.env.homolog` (`/opt/clinicavida-homolog/.env.homolog`):

```
N8N_WEBHOOK_URL=http://n8n-upbl-n8n-1:5678/webhook/clinicavida-outbound
WA_ENABLED=true
WA_DRY_RUN=false
WA_ALLOWLIST=<numero_da_equipe_so_digitos>   # ex: 5566999990001
```

Restart só a API:
```bash
cd /opt/clinicavida-homolog
sudo docker compose --env-file .env.homolog -f docker-compose.homolog.yml up -d api
```

## 4. Teste (runbook Fase 2)

1. Cadastrar agendamento ~24h à frente, paciente com número **da allowlist**.
2. Aguardar cron (até 10 min) ou observar `docker logs clinicavida-api-homolog -f`.
3. Esperado: chega WhatsApp real; mensagem `ENVIADA` → `ENTREGUE` (callback status).
4. Cadastrar outro com número **fora** da allowlist → log `motivoDryRun: "allowlist"`, nada enviado.

## ⚠️ Limitação conhecida — resposta SIM/NÃO não confirma agendamento ainda

O inbound da Evolution **não carrega** o `eventId` da mensagem original. O
backend (`receberResposta`) só dispara confirmação/cancelamento automático com
`eventIdOriginal`. Sem ele, a resposta é **registrada** (mensagem INBOUND,
vinculada ao paciente por telefone) mas **não muda o status** do agendamento.

**Follow-up (PR backend):** em `receberResposta`, quando `eventIdOriginal`
ausente, localizar a última mensagem OUTBOUND de confirmação
(`CONFIRMACAO_24H`/`LEMBRETE_2H`) para aquele telefone com `agendamentoId` e
agendamento pendente, e processar a resposta sobre ela. Só então o loop
SIM→CONFIRMADO / NÃO→CANCELADO funciona ponta a ponta.

Até lá, Fase 2 valida **apenas o envio outbound real**; a recepção confirma/
cancela manualmente a partir da resposta registrada na tela WhatsApp.
