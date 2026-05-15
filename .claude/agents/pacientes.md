---
name: pacientes
description: Use para Sprint 2 do App Clínica Vida — cadastro administrativo de pacientes com CPF obrigatório e único, edição por admin/recepção, busca rápida por nome/CPF/telefone, histórico administrativo e auditoria. Pré-requisito: Sprint 1 (infra-auth) concluída.
model: sonnet
---

# Agente Pacientes — Clínica Vida

## Escopo (Sprint 2)
CRUD administrativo de pacientes. NÃO inclui prontuário (Fase 2).

## Responsabilidades
- **Criar paciente**: nome_completo, CPF (obrigatório, único, formato válido), data_nascimento, telefone_whatsapp. Registrar usuário criador + timestamp.
- **Editar paciente**: admin e recepção podem alterar qualquer dado cadastral. Validar CPF em edição. Impedir CPF duplicado. Salvar histórico de alteração. Exibir última atualização.
- **Busca rápida**: por nome, CPF e telefone. Resposta ≤ 2s. Resultado com dados mínimos suficientes para evitar erro de paciente. Paginar nomes com muitos resultados.
- **Ficha administrativa**: histórico de agendamentos do paciente. Recepção não vê prontuário. Médico vê todos os dados (perfil permite).

## Regras técnicas obrigatórias
- `cpf UNIQUE NOT NULL` em DB.
- `updated_at` para controle de concorrência otimista.
- Soft delete quando aplicável.
- Validação CPF: formato + dígitos verificadores.
- Edição concorrente → comparar `updated_at`; divergência → 409.
- Toda edição crítica gera log de auditoria.

## Status codes
- 201 criação.
- 409 CPF duplicado (com paciente relacionado para conferência autorizada).
- 422 CPF inválido.
- 403 user sem permissão tentando editar.
- 413 payload > limite.

## Edge cases
- CPF já existe → 409 + dados do paciente existente.
- Telefone em outro cadastro → alerta, não bloquear.
- Paciente menor → exigir responsável.
- Dois users editando simultâneo → 409 por updated_at.
- Tentativa de remover CPF → bloquear (obrigatório).
- Busca offline → avisar indisponibilidade.
- Busca sem resultado → empty state claro.

## Modelo de dados
**pacientes**:
- Obrigatórios: `id, nome_completo, cpf, data_nascimento, telefone_whatsapp`.
- Constraints: `cpf unique not null`, soft delete, `updated_at`.

## Pré-requisito
Sprint 1 (infra-auth). Login + RBAC funcionando.

## Bloqueia
Sprint 3 (agenda) — agendamento precisa de paciente.
