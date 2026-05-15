-- CreateEnum
CREATE TYPE "ListaEsperaStatus" AS ENUM ('ATIVO', 'CONTATADO', 'RECUSADO', 'AGENDADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "lista_espera" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID,
    "especialidade" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "melhores_horarios" JSONB,
    "observacoes" TEXT,
    "status" "ListaEsperaStatus" NOT NULL DEFAULT 'ATIVO',
    "ultima_oferta_em" TIMESTAMP(3),
    "ultima_resposta_em" TIMESTAMP(3),
    "motivo_recusa" TEXT,
    "criado_por" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_espera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lista_espera_status_prioridade_created_at_idx" ON "lista_espera"("status", "prioridade", "created_at");

-- CreateIndex
CREATE INDEX "lista_espera_paciente_id_status_idx" ON "lista_espera"("paciente_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lista_espera_ativa_unica"
ON "lista_espera" ("paciente_id", "profissional_id", "especialidade")
NULLS NOT DISTINCT
WHERE "status" IN ('ATIVO', 'CONTATADO');

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
