# Fase 2 WhatsApp — setup n8n + Evolution (homolog)

Liga o caminho real **backend → n8n → Evolution API → WhatsApp** e o retorno
**WhatsApp → Evolution → n8n → backend**, restrito por allowlist (ver
[`docs/runbook-whatsapp.md`](../runbook-whatsapp.md)).

## ⚠️ ATENÇÃO — infra compartilhada na VPS

A VPS roda **outro sistema** (bot **financeiro**,
`financeiro.clinicavidapopular.com.br`) no MESMO n8n e na MESMA Evolution.

- A instância Evolution **`clinicavida`** (número `5517982056029`) é do **bot
  financeiro**. Seu webhook aponta pra `whatsapp-financeiro`. **NÃO MEXER.**
- O webhook `MESSAGES_UPSERT` da Evolution aponta pra **uma URL só** por
  instância → app e financeiro não podem dividir o mesmo número no inbound.

**Decisão (2026-05-21):** o app Clínica Vida usa uma **instância Evolution
SEPARADA** (`clinicavida-app`) com **número próprio**. Assim o inbound não
conflita com o financeiro.

## Topologia — comunicação por rede Docker interna

URLs **públicas** (`*.srv1477984.hstgr.cloud`) **não funcionam de dentro da
VPS** (hairpin NAT → HTTP 000). Backend, n8n e Evolution se falam por **DNS
interno do Docker**.

```
backend (clinicavida-api-homolog:3000)
  → POST n8n http://n8n-upbl-n8n-1:5678/webhook/clinicavida-outbound
      → POST Evolution http://evolution-api-vyes-api-1:8080/message/sendText/clinicavida-app → WhatsApp
      → POST backend http://clinicavida-api-homolog:3000/api/bot/whatsapp/status

WhatsApp (nº do app) → Evolution inst. clinicavida-app (MESSAGES_UPSERT)
  → POST n8n http://n8n-upbl-n8n-1:5678/webhook/clinicavida-inbound
      → POST backend http://clinicavida-api-homolog:3000/api/bot/whatsapp/inbound
```

Containers / portas internas:
- backend: `clinicavida-api-homolog:3000` (rede `clinicavida-homolog_clinicavida-net`)
- n8n: `n8n-upbl-n8n-1:5678` (rede `n8n-upbl_default`)
- Evolution v2.3.7: `evolution-api-vyes-api-1:8080` (rede `evolution-api-vyes_default`)
- API interna Evolution: `http://127.0.0.1:32778` (a partir do host VPS)

## 0. Redes Docker (uma vez)

```bash
sudo docker network connect n8n-upbl_default            clinicavida-api-homolog   # api -> n8n
sudo docker network connect clinicavida-homolog_clinicavida-net n8n-upbl-n8n-1   # n8n -> backend
# n8n -> evolution: n8n JÁ está na rede evolution-api-vyes_default (não reconectar)
```

> Persistência: api↔n8n fixado no `docker-compose.homolog.yml` (rede externa
> `n8n-upbl_default`). A conexão `n8n-upbl-n8n-1`↔clinicavida-net é runtime —
> re-rodar se a stack n8n for recriada.

## 1. Criar e parear a instância `clinicavida-app` (número novo)

Na VPS (usa `127.0.0.1:32778`; apikey global da Evolution):

```bash
K="<APIKEY_EVOLUTION>"
# cria instância
curl -X POST 'http://127.0.0.1:32778/instance/create' \
  -H "apikey: $K" -H 'Content-Type: application/json' \
  -d '{"instanceName":"clinicavida-app","integration":"WHATSAPP-BAILEYS","qrcode":true}'
# pega QR pra parear o número novo (escanear no WhatsApp do app)
curl "http://127.0.0.1:32778/instance/connect/clinicavida-app" -H "apikey: $K"
```

Escanear o QR com o **chip/número do app**. Conferir `connectionStatus: open`:
```bash
curl "http://127.0.0.1:32778/instance/fetchInstances" -H "apikey: $K"
```

## 2. Webhook da instância `clinicavida-app` → n8n inbound

> Só na instância `clinicavida-app`. **Nunca** rodar `webhook/set` na instância
> `clinicavida` (financeiro).

```bash
curl -X POST 'http://127.0.0.1:32778/webhook/set/clinicavida-app' \
  -H "apikey: $K" -H 'Content-Type: application/json' \
  -d '{"webhook":{"enabled":true,"url":"http://n8n-upbl-n8n-1:5678/webhook/clinicavida-inbound","webhookByEvents":false,"events":["MESSAGES_UPSERT"]}}'
```

## 3. Importar + ativar os workflows no n8n

UI n8n → **Workflows → Import from File**:
1. [`clinicavida-outbound.json`](./clinicavida-outbound.json) (chama `sendText/clinicavida-app`)
2. [`clinicavida-inbound.json`](./clinicavida-inbound.json)

Ativar cada um (toggle "Active"). Conferir que a `apikey` embutida nos nós HTTP
bate com a da Evolution.

## 4. Backend: apontar n8n + sair do dry-run

`.env.homolog` (`/opt/clinicavida-homolog/.env.homolog`):
```
N8N_WEBHOOK_URL=http://n8n-upbl-n8n-1:5678/webhook/clinicavida-outbound
WA_ENABLED=true
WA_DRY_RUN=false
WA_ALLOWLIST=<numero_da_equipe_so_digitos>
```
```bash
cd /opt/clinicavida-homolog
sudo docker compose --env-file .env.homolog -f docker-compose.homolog.yml up -d api
```

## 5. Teste (runbook Fase 2)

1. Agendamento ~24h à frente, paciente com número **da allowlist**.
2. Aguardar cron (≤10 min) ou `docker logs clinicavida-api-homolog -f`.
3. Esperado: WhatsApp real do número do app; mensagem `ENVIADA` → `ENTREGUE`.
4. Número fora da allowlist → log `motivoDryRun: "allowlist"`, nada enviado.

## ⚠️ Limitação conhecida — resposta SIM/NÃO não confirma agendamento ainda

Inbound da Evolution não traz o `eventId` original. `receberResposta` só dispara
confirmação/cancelamento com `eventIdOriginal`; sem ele, registra a resposta mas
não muda o status. **Follow-up (PR backend):** localizar a última msg OUTBOUND de
confirmação por telefone e processar sobre ela. Até lá, recepção confirma manual.
