-- CreateTable
CREATE TABLE "configuracoes_clinica" (
    "id" UUID NOT NULL,
    "nome_clinica" TEXT NOT NULL DEFAULT 'Clínica Vida Popular',
    "hora_abertura" VARCHAR(5) NOT NULL DEFAULT '07:00',
    "hora_fechamento" VARCHAR(5) NOT NULL DEFAULT '19:00',
    "dias_funcionamento" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "duracao_consulta_min" INTEGER NOT NULL DEFAULT 30,
    "intervalo_almoco_ini" VARCHAR(5),
    "intervalo_almoco_fim" VARCHAR(5),
    "timezone" TEXT NOT NULL DEFAULT 'America/Cuiaba',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "atualizado_por" UUID,

    CONSTRAINT "configuracoes_clinica_pkey" PRIMARY KEY ("id")
);
