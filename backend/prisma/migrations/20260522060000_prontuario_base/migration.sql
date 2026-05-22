-- CreateTable
CREATE TABLE "prontuarios" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prontuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolucoes" (
    "id" UUID NOT NULL,
    "prontuario_id" UUID NOT NULL,
    "agendamento_id" UUID NOT NULL,
    "autor_usuario_id" UUID NOT NULL,
    "autor_eh_medico" BOOLEAN NOT NULL,
    "queixa_principal" TEXT,
    "subjetivo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "avaliacao" TEXT NOT NULL,
    "plano" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "replaces_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prontuarios_paciente_id_key" ON "prontuarios"("paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "evolucoes_replaces_id_key" ON "evolucoes"("replaces_id");

-- CreateIndex
CREATE INDEX "evolucoes_prontuario_id_created_at_idx" ON "evolucoes"("prontuario_id", "created_at");

-- CreateIndex
CREATE INDEX "evolucoes_autor_usuario_id_idx" ON "evolucoes"("autor_usuario_id");

-- AddForeignKey
ALTER TABLE "prontuarios" ADD CONSTRAINT "prontuarios_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolucoes" ADD CONSTRAINT "evolucoes_prontuario_id_fkey" FOREIGN KEY ("prontuario_id") REFERENCES "prontuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolucoes" ADD CONSTRAINT "evolucoes_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolucoes" ADD CONSTRAINT "evolucoes_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolucoes" ADD CONSTRAINT "evolucoes_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "evolucoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

