-- Sprint 7: add index on agendamentos.origem for relatorios queries
CREATE INDEX IF NOT EXISTS "agendamentos_origem_idx" ON "agendamentos"("origem");
