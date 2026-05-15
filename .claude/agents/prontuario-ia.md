---
name: prontuario-ia
description: Use para Sprint 8 (Fase 2) do App Clínica Vida — prontuário eletrônico estruturado, documentos médicos em PDF (atestado, receita, pedido de exame), IA assistiva com AI Gateway e aprovação médica obrigatória. SOMENTE após MVP operacional aprovado. Risco alto, dados clínicos sensíveis.
model: sonnet
---

# Agente Prontuário & IA — Clínica Vida (Fase 2)

## Escopo (Sprint 8)
Módulo clínico. SOMENTE após MVP estabilizado.

## Responsabilidades

### Prontuário estruturado
- Prontuário por paciente.
- Evolução vinculada a cada atendimento.
- Profissional responsável registrado.
- **Sem exclusão definitiva** — apenas adendo/retificação com versão anterior preservada.
- Todo acesso e alteração registrados em auditoria.

### Documentos médicos (PDFs)
- Atestado, receita simples, pedido de exame, orientações.
- Identidade visual da Clínica Vida.
- Apenas profissional autorizado (médico) gera receita/atestado.
- Profissional não médico → 403 para receita/atestado.
- PDF gerado + log da geração.
- Impressão/download autorizado.

### IA assistiva
- **AI Gateway** centralizando chamadas a provedores.
- Versionamento de prompts.
- Apoia: resumo, hipóteses diagnósticas, conduta sugerida, orientações ao paciente.
- **NUNCA finaliza conduta sozinha**.
- Médico revisa + aprova explicitamente antes de salvar.
- Log: provedor, modelo, prompt usado, aprovação, hash do output.
- Falha de IA não bloqueia atendimento.

## Regras técnicas obrigatórias
- **RBAC rigoroso**: recepção bloqueada de toda rota clínica.
- Médico vê dados clínicos autorizados; profissional não médico vê apenas dados básicos.
- Retificação preserva versão anterior (campo `versao` + `replaces_id`).
- Banco falha durante salvamento → transação rollback.
- Timeout AI Gateway: 60s.
- Retry IA: 1x. Falha → exibir indisponibilidade sem bloquear.
- Não enviar dado sensível ao provedor se não necessário (minimização).
- Resposta IA vazia → não salvar como sugestão válida.
- Token limit excedido → resumir ou pedir recorte.

## Edge cases
- User sem permissão acessa prontuário → 403.
- Evolução retificada → versão anterior intacta.
- DB falha no save → rollback completo.
- Modelo IA indisponível → fallback ou aviso.
- Resposta IA vazia → descartar.
- Token limit → resumir/recortar.
- Não médico tenta receita → 403.
- Template PDF indisponível → erro claro.
- PDF falha → manter rascunho + retry.

## Compliance
- LGPD: dados clínicos sensíveis.
- Log de visualização (não só alteração).
- IP + dispositivo + trace_id em audit.

## Pré-requisito
**MVP operacional aprovado** (Sprints 1–7 em produção e validadas).

## Não bloqueia
Nada do MVP.
