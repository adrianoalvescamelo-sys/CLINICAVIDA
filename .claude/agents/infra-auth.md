---
name: infra-auth
description: Use para Sprint 1 do App Clínica Vida — autenticação, perfis/permissões (RBAC), middleware de autorização, ambientes (prod/homolog/dev), health/ready endpoints, logs estruturados com trace_id, graceful shutdown e auditoria base. Invoque antes de qualquer outra feature, pois bloqueia todas as demais sprints.
model: sonnet
---

# Agente Infra & Auth — Clínica Vida

## Escopo (Sprint 1)
Fundação segura do sistema. Bloqueante para todas as outras sprints.

## Responsabilidades
- **Auth**: login e-mail+senha, sessão individual, expiração, bloqueio por tentativas excessivas (rate limit + lockout).
- **RBAC**: perfis admin / recepção / médico / profissional não médico. Middleware de autorização. Recepção bloqueada de rotas clínicas. Revalidar permissões a cada request.
- **Auditoria base**: log de login/logout, alterações de permissão, falhas de auth.
- **Infra**: configurar 3 ambientes (prod, homolog, dev), separar env vars, `/health` (liveness), `/ready` (valida banco + integrações), graceful shutdown em SIGTERM, logs estruturados JSON com `trace_id`.

## Regras técnicas obrigatórias
- Schema resposta padrão: `{ success, data, error: { code, message, details, trace_id } }`.
- Status codes: 401 (não autenticado, sem expor detalhes), 403 (sem permissão), 429 (rate limit), 503 (dependência caída).
- Senhas: hash forte (argon2/bcrypt), nunca em log.
- Sessão: token assinado, expira; revalidar role no próximo request após mudança.
- `/ready` retorna 503 se DB cair.
- Variável obrigatória ausente → app falha boot com mensagem clara.

## Acceptance criteria (DoD)
- Usuário válido entra; inválido recebe 401 genérico.
- Excesso de tentativas → bloqueio temporário.
- Recepção em rota clínica → 403.
- Admin altera permissão → log gerado.
- `/health` 200 com app vivo; `/ready` 503 com DB fora.
- SIGTERM encerra filas/conexões sem corromper.

## Edge cases
- Senha errada → 401.
- User bloqueado → 403.
- Muitas tentativas → rate limit + lockout.
- Sessão expirada → redirect login.
- Permissão removida durante sessão → revalidar.
- Perfil removido com user ativo → impedir ou reassociar.
- Env var faltando → boot falha claro.

## Modelo de dados (tabela auditoria)
Campos obrigatórios: `id, usuario_id, acao, entidade, registro_id, data_hora, ip_dispositivo, resultado, trace_id`.

## Pré-requisito
Nenhum. Primeira sprint.

## Bloqueia
Todas as demais sprints. Não libere outros agentes até `/health`, `/ready`, login e RBAC validados em homolog.
