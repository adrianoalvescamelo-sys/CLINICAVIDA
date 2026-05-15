-- CreateEnum
CREATE TYPE "AgendamentoStatus" AS ENUM ('SOLICITADO', 'PRE_AGENDAMENTO', 'CONFIRMADO', 'CONFIRMACAO_TARDIA', 'AGUARDANDO', 'EM_ATENDIMENTO', 'ATENDIDO', 'FALTOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AgendamentoOrigem" AS ENUM ('RECEPCAO', 'ADMIN', 'BOT_WHATSAPP', 'PACIENTE_WHATSAPP');

-- CreateEnum
CREATE TYPE "TipoAtendimento" AS ENUM ('CONSULTA', 'RETORNO', 'EXAME', 'PROCEDIMENTO', 'OUTRO');

-- CreateTable
CREATE TABLE "profissionais" (
    "id" UUID NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "especialidade" TEXT,
    "registro_conselho" TEXT,
    "eh_medico" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_id" UUID,
    "cor" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "data_hora_inicio" TIMESTAMP(3) NOT NULL,
    "data_hora_fim" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoAtendimento" NOT NULL DEFAULT 'CONSULTA',
    "status" "AgendamentoStatus" NOT NULL,
    "origem" "AgendamentoOrigem" NOT NULL,
    "encaixe" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "motivo_cancelamento" TEXT,
    "event_id" TEXT,
    "criado_por" UUID,
    "atualizado_por" UUID,
    "confirmado_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos_historico" (
    "id" UUID NOT NULL,
    "agendamento_id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "status_anterior" "AgendamentoStatus",
    "status_novo" "AgendamentoStatus",
    "diff" JSONB NOT NULL,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agendamentos_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios_agenda" (
    "id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "data_hora_inicio" TIMESTAMP(3) NOT NULL,
    "data_hora_fim" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "criado_por" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_usuario_id_key" ON "profissionais"("usuario_id");

-- CreateIndex
CREATE INDEX "profissionais_ativo_idx" ON "profissionais"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "agendamentos_event_id_key" ON "agendamentos"("event_id");

-- CreateIndex
CREATE INDEX "agendamentos_profissional_id_data_hora_inicio_idx" ON "agendamentos"("profissional_id", "data_hora_inicio");

-- CreateIndex
CREATE INDEX "agendamentos_paciente_id_data_hora_inicio_idx" ON "agendamentos"("paciente_id", "data_hora_inicio");

-- CreateIndex
CREATE INDEX "agendamentos_status_idx" ON "agendamentos"("status");

-- CreateIndex
CREATE INDEX "agendamentos_data_hora_inicio_idx" ON "agendamentos"("data_hora_inicio");

-- CreateIndex
CREATE INDEX "agendamentos_historico_agendamento_id_created_at_idx" ON "agendamentos_historico"("agendamento_id", "created_at");

-- CreateIndex
CREATE INDEX "bloqueios_agenda_profissional_id_data_hora_inicio_idx" ON "bloqueios_agenda"("profissional_id", "data_hora_inicio");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos_historico" ADD CONSTRAINT "agendamentos_historico_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios_agenda" ADD CONSTRAINT "bloqueios_agenda_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
