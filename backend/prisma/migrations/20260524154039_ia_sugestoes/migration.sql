-- CreateEnum
CREATE TYPE "TipoSugestaoIA" AS ENUM ('RESUMO', 'HIPOTESE', 'CONDUTA', 'ORIENTACOES');

-- CreateEnum
CREATE TYPE "StatusSugestaoIA" AS ENUM ('GERADA', 'APROVADA', 'REJEITADA', 'FALHA');

-- CreateTable
CREATE TABLE "sugestoes_ia" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "agendamento_id" UUID,
    "evolucao_id" UUID,
    "tipo" "TipoSugestaoIA" NOT NULL,
    "status" "StatusSugestaoIA" NOT NULL DEFAULT 'GERADA',
    "provider" TEXT,
    "modelo" TEXT,
    "prompt_versao" TEXT,
    "conteudo_gerado" TEXT,
    "conteudo_aprovado" TEXT,
    "tokens_prompt" INTEGER,
    "tokens_resposta" INTEGER,
    "erro_mensagem" TEXT,
    "autor_usuario_id" UUID NOT NULL,
    "aprovado_por_usuario_id" UUID,
    "aprovado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sugestoes_ia_evolucao_id_key" ON "sugestoes_ia"("evolucao_id");

-- CreateIndex
CREATE INDEX "sugestoes_ia_paciente_id_created_at_idx" ON "sugestoes_ia"("paciente_id", "created_at");

-- CreateIndex
CREATE INDEX "sugestoes_ia_autor_usuario_id_idx" ON "sugestoes_ia"("autor_usuario_id");

-- AddForeignKey
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_evolucao_id_fkey" FOREIGN KEY ("evolucao_id") REFERENCES "evolucoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_aprovado_por_usuario_id_fkey" FOREIGN KEY ("aprovado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
