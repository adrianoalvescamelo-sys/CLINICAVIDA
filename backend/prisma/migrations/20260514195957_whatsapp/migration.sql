-- CreateEnum
CREATE TYPE "MensagemTipo" AS ENUM ('CONFIRMACAO_24H', 'LEMBRETE_2H', 'CONFIRMACAO_TARDIA', 'CANCELAMENTO', 'REMARCACAO', 'VAGA_LIBERADA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MensagemStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'RESPONDIDA', 'FALHA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MensagemDirecao" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" UUID NOT NULL,
    "paciente_id" UUID,
    "agendamento_id" UUID,
    "telefone" VARCHAR(20) NOT NULL,
    "direcao" "MensagemDirecao" NOT NULL DEFAULT 'OUTBOUND',
    "tipo" "MensagemTipo" NOT NULL,
    "status" "MensagemStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximo_retry_em" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "resposta" TEXT,
    "erro" TEXT,
    "event_id" TEXT NOT NULL,
    "provider_msg_id" TEXT,
    "enviada_em" TIMESTAMP(3),
    "entregue_em" TIMESTAMP(3),
    "respondida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_whatsapp_event_id_key" ON "mensagens_whatsapp"("event_id");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_status_proximo_retry_em_idx" ON "mensagens_whatsapp"("status", "proximo_retry_em");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_paciente_id_created_at_idx" ON "mensagens_whatsapp"("paciente_id", "created_at");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_agendamento_id_idx" ON "mensagens_whatsapp"("agendamento_id");

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
