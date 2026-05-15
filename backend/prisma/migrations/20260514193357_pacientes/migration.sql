-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO', 'NAO_INFORMADO');

-- CreateTable
CREATE TABLE "pacientes" (
    "id" UUID NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "data_nascimento" DATE NOT NULL,
    "sexo" "Sexo" NOT NULL DEFAULT 'NAO_INFORMADO',
    "telefone_whatsapp" VARCHAR(20) NOT NULL,
    "telefone_secundario" VARCHAR(20),
    "email" VARCHAR(255),
    "responsavel_nome" TEXT,
    "responsavel_cpf" VARCHAR(11),
    "endereco" JSONB,
    "observacoes" TEXT,
    "criado_por" UUID,
    "atualizado_por" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes_historico" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacientes_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_cpf_key" ON "pacientes"("cpf");

-- CreateIndex
CREATE INDEX "pacientes_nome_completo_idx" ON "pacientes"("nome_completo");

-- CreateIndex
CREATE INDEX "pacientes_telefone_whatsapp_idx" ON "pacientes"("telefone_whatsapp");

-- CreateIndex
CREATE INDEX "pacientes_deleted_at_idx" ON "pacientes"("deleted_at");

-- CreateIndex
CREATE INDEX "pacientes_historico_paciente_id_created_at_idx" ON "pacientes_historico"("paciente_id", "created_at");

-- AddForeignKey
ALTER TABLE "pacientes_historico" ADD CONSTRAINT "pacientes_historico_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
