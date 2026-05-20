# App Clinica Vida

Aplicativo interno da Clinica Vida Popular — Sinop/MT. Uso exclusivo da clinica, nao e SaaS e nao sera distribuido externamente.

O sistema e uma PWA (Progressive Web App) para gestao de pacientes, agendamentos, comunicacao via WhatsApp e paineis de chamada. A integracao com WhatsApp usa n8n + Evolution API. Funcionalidades de IA estao previstas para a Fase 2, apos o MVP em producao.

Especificacao do produto: [`SPEC_App_Clinica_Vida_revisada.json`](./SPEC_App_Clinica_Vida_revisada.json) (v1.1, 2026-05-14).
Guia de orquestracao e decisoes de negocio: [`CLAUDE.md`](./CLAUDE.md).
Manual operacional para usuario final (recepcao/admin/medico): [`docs/MANUAL_USUARIO.md`](./docs/MANUAL_USUARIO.md).

---

## Stack

- **Runtime:** Node.js 20
- **Backend:** NestJS 10 + TypeScript + Prisma 5 (ORM)
- **Banco de dados:** PostgreSQL 16
- **Autenticacao:** JWT (access token 15 min) + refresh token com revogacao no banco (7 dias)
- **Hash de senha:** argon2id
- **Logs:** pino estruturado (JSON) com `trace_id`
- **Frontend:** React 18 + Vite + TypeScript (PWA)
- **Integracoes:** n8n + Evolution API (WhatsApp, ativado a partir da Sprint 4)
- **Infra local:** Docker Compose (Postgres + API)
- **Testes:** vitest (unit) + jest + supertest (e2e)

---

## Pre-requisitos

| Ferramenta | Versao minima |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Docker | 24.x |
| Docker Compose | v2 (plugin, `docker compose`) |

---

## Setup inicial

```bash
# 1. Clonar o repositorio
git clone <repo-url>
cd CLINICAVIDA

# 2. Copiar variaveis de ambiente e editar com seus valores reais
cp .env.example .env
# Edite .env: defina JWT_SECRET, JWT_REFRESH_SECRET, BOT_SECRET, DATABASE_URL, etc.

# 3. Subir o banco de dados
docker compose up -d postgres

# 4. Instalar dependencias do backend
cd backend && npm install

# 5. Aplicar migrations
npx prisma migrate deploy

# 6. Popular usuarios demo (um por perfil)
npm run seed

# 7. Iniciar API em modo desenvolvimento
npm run start:dev
```

Para o frontend (em outro terminal):

```bash
cd frontend && npm install && npm run dev
```

---

## Comandos do dia a dia

Todos os comandos abaixo devem ser executados dentro de `backend/` salvo indicacao em contrario.

### Backend

| Comando | Descricao |
|---|---|
| `npm run start:dev` | Inicia API com hot reload (modo desenvolvimento) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm run start:prod` | Inicia API a partir do build compilado |
| `npm test` | Executa testes unitarios (vitest) |
| `npm run test:e2e` | Executa testes de integracao (jest + supertest) |
| `npm run test:cov` | Gera relatorio de cobertura de testes |

### Prisma / Banco de dados

| Comando | Descricao |
|---|---|
| `npx prisma migrate dev --name <nome>` | Cria e aplica nova migration em desenvolvimento |
| `npx prisma migrate deploy` | Aplica migrations pendentes (prod/homolog) |
| `npx prisma studio` | Abre interface visual do banco no navegador |
| `npm run seed` | Popula banco com usuarios demo (um por perfil) |

---

## Docker stack completa

```bash
# Subir Postgres + API em background
docker compose up -d

# Ver logs da API em tempo real
docker compose logs -f api

# Parar todos os servicos
docker compose down

# Parar e remover volumes (reset completo do banco)
docker compose down -v
```

---

## Endpoints de saude

| Endpoint | Descricao | Codigo esperado |
|---|---|---|
| `GET /health` | Liveness — API esta no ar | 200 sempre que o processo responde |
| `GET /ready` | Readiness — valida conexao com banco e integracoes | 200 OK / 503 se banco cair |

Ambos retornam o schema padrao:
```json
{ "success": true, "data": { "status": "ok" }, "error": null }
```

---

## Fluxo de autenticacao

- Usuario envia `POST /auth/login` com e-mail e senha.
- API valida credenciais e, em caso de sucesso, retorna `access_token` (JWT, 15 min) e `refresh_token` (opaco, 7 dias, armazenado no banco).
- O cliente envia `Authorization: Bearer <access_token>` em cada request protegida.
- Quando o access token expira, o cliente chama `POST /auth/refresh` com `{ "refresh_token": "..." }` e recebe novos tokens.
- `POST /auth/logout` revoga o refresh token no banco — o access token continua valido ate expirar naturalmente (15 min).
- Tentativas excessivas de login ativam bloqueio temporario (rate limit + lockout) — resposta 429.
- Usuario com conta bloqueada recebe 403.
- Permissao alterada pelo admin e revalidada no proximo request.

---

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha todos os campos marcados como obrigatorio.

| Variavel | Obrigatorio | Exemplo |
|---|---|---|
| `NODE_ENV` | sim | `development` |
| `PORT` | sim | `3000` |
| `DATABASE_URL` | sim | `postgresql://clinica:clinica@localhost:5432/clinicavida` |
| `JWT_SECRET` | sim | `minha-chave-secreta-com-no-minimo-32-chars` |
| `JWT_EXPIRES_IN` | sim | `15m` |
| `JWT_REFRESH_SECRET` | sim | `outra-chave-diferente-com-no-minimo-32-chars` |
| `JWT_REFRESH_EXPIRES_IN` | sim | `7d` |
| `CORS_ORIGIN` | sim | `http://localhost:5173` |
| `BOT_SECRET` | sim | `chave-compartilhada-com-n8n-para-webhook-bot` |
| `SEED_ADMIN_EMAIL` | nao | `admin@clinicavida.com` |
| `SEED_ADMIN_PASSWORD` | nao | `Admin@2026!` |
| `SEED_RECEPCAO_EMAIL` | nao | `recepcao@clinicavida.com` |
| `SEED_MEDICO_EMAIL` | nao | `medico@clinicavida.com` |
| `SEED_PROFISSIONAL_EMAIL` | nao | `profissional@clinicavida.com` |

> Variavel obrigatoria ausente faz o boot falhar com mensagem de erro clara indicando qual variavel esta faltando.

---

## Perfis (RBAC)

| Perfil | Acesso |
|---|---|
| `admin` | Acesso total: cadastros, agenda, configuracoes, permissoes, relatorios, auditoria. |
| `recepcao` | Cadastro de pacientes, agenda, confirmacoes WhatsApp. Sem acesso a rotas clinicas (prontuario, prescricao). Tentativa gera 403. |
| `medico` | Propria agenda, todos os dados do paciente, painel de chamada. Fase 2: prontuario completo, receita e atestado. |
| `profissional_nao_medico` | Propria agenda e dados basicos do paciente. Sem receita nem atestado. |

---

## Auditoria

Toda acao critica (login, logout, falha de autenticacao, alteracao de permissao) e registrada na tabela `auditoria` com os campos:

`id`, `usuario_id`, `acao`, `entidade`, `registro_id`, `data_hora`, `ip_dispositivo`, `resultado`, `trace_id`.

---

## Troubleshooting

**"DB connection refused" ao iniciar a API**
O Postgres ainda nao esta rodando. Execute `docker compose up -d postgres` e aguarde o container estar `healthy`.

**"ECONNREFUSED" no endpoint `/ready`**
A variavel `DATABASE_URL` esta apontando para o host errado.
- Dentro do Docker Compose (servico `api`): use `postgres` como hostname.
- No desenvolvimento local (sem Docker para a API): use `localhost`.

**"JWT secret too short" no boot**
`JWT_SECRET` e `JWT_REFRESH_SECRET` devem ter no minimo 32 caracteres cada.

**Reset completo do banco em desenvolvimento**
```bash
docker compose down -v
docker compose up -d postgres
cd backend
npx prisma migrate deploy
npm run seed
```

**Porta 3000 ja em uso**
Altere `PORT` no `.env` ou encerre o processo que ocupa a porta:
```bash
# Linux/macOS
lsof -ti:3000 | xargs kill
# Windows
netstat -ano | findstr :3000
```

**Sessao expirada**
O cliente deve detectar resposta 401 e redirecionar para a tela de login. O refresh token pode ser usado para renovar sem novo login enquanto estiver valido e nao revogado.

---

## Estrutura do repositorio

```
CLINICAVIDA/
|-- backend/                NestJS API
|   |-- prisma/             Schema Prisma e migrations
|   |-- src/                Codigo-fonte modular
|   |   |-- auth/           Autenticacao, JWT, refresh, guards
|   |   |-- common/         Interceptors, filtros, decorators globais
|   |   |-- config/         Validacao de env vars (class-validator)
|   |   |-- health/         Endpoints /health e /ready
|   |   |-- pacientes/      Modulo de pacientes (Sprint 2)
|   |   |-- agenda/         Modulo de agendamentos (Sprint 3)
|   |   |-- whatsapp/       Integracao WhatsApp/n8n (Sprint 4)
|   |   |-- recepcao/       Paineis de chamada (Sprint 5+6)
|   |   |-- relatorios/     Relatorios (Sprint 7)
|   |   `-- prisma/         PrismaService singleton
|   |-- test/               Testes e2e (jest + supertest)
|   |-- Dockerfile
|   `-- package.json
|-- frontend/               React 18 + Vite (PWA)
|   `-- src/
|-- .claude/agents/         Agentes de IA por sprint
|-- docs/                   Planos e documentacao interna
|-- docker-compose.yml
|-- .env.example
|-- CLAUDE.md               Guia de orquestracao
`-- SPEC_App_Clinica_Vida_revisada.json
```

---

## Proximos sprints

| Sprint | Modulo | Pre-requisito |
|---|---|---|
| 2 | Pacientes — cadastro, CPF unico, busca | Sprint 1 (infra-auth) |
| 3 | Agenda — agendamentos, conflitos, encaixes | Sprint 2 (pacientes) |
| 4 | WhatsApp — confirmacoes, cancelamentos, bot | Sprint 3 (agenda) |
| 5 + 6 | Recepcao — painel de chamada, painel TV | Sprint 3 (agenda) |
| 7 | Relatorios — ocupacao, faltas, produtividade | Sprint 3 (agenda) |
| 8 | Prontuario + IA (Fase 2, pos-MVP) | MVP aprovado em producao |

O agente `qa-auditoria` roda ao final de cada sprint antes do merge para validar DoD, permissoes e edge cases.

---

## Licenca

Interno — Clinica Vida Popular Sinop/MT — nao distribuir.
