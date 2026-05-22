-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('RECEITA', 'ATESTADO', 'PEDIDO_EXAME', 'ORIENTACOES');

-- CreateTable
CREATE TABLE "documentos_medicos" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "autor_usuario_id" UUID NOT NULL,
    "autor_eh_medico" BOOLEAN NOT NULL,
    "agendamento_id" UUID,
    "tipo" "TipoDocumento" NOT NULL,
    "conteudo" JSONB NOT NULL,
    "pdf" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_medicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_medicos_paciente_id_created_at_idx" ON "documentos_medicos"("paciente_id", "created_at");

-- CreateIndex
CREATE INDEX "documentos_medicos_autor_usuario_id_idx" ON "documentos_medicos"("autor_usuario_id");

-- AddForeignKey
ALTER TABLE "documentos_medicos" ADD CONSTRAINT "documentos_medicos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_medicos" ADD CONSTRAINT "documentos_medicos_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_medicos" ADD CONSTRAINT "documentos_medicos_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
