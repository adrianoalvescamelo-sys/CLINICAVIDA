-- CreateEnum
CREATE TYPE "PerfilTipo" AS ENUM ('ADMIN', 'RECEPCAO', 'MEDICO', 'PROFISSIONAL_NAO_MEDICO');

-- CreateEnum
CREATE TYPE "AuditResultado" AS ENUM ('SUCESSO', 'FALHA', 'NEGADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "perfil" "PerfilTipo" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tentativas_login" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMP(3),
    "ultimo_login_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "registro_id" TEXT,
    "data_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_dispositivo" TEXT,
    "resultado" "AuditResultado" NOT NULL,
    "trace_id" TEXT NOT NULL,
    "detalhes" JSONB,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_entidade_registro_id_idx" ON "auditoria"("entidade", "registro_id");

-- CreateIndex
CREATE INDEX "auditoria_data_hora_idx" ON "auditoria"("data_hora");

-- CreateIndex
CREATE INDEX "auditoria_trace_id_idx" ON "auditoria"("trace_id");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
