import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditResultado, ConfiguracaoClinica } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateConfiguracaoDto } from './dto/update-configuracao.dto';

@Injectable()
export class ConfiguracoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<ConfiguracaoClinica> {
    let cfg = await this.prisma.configuracaoClinica.findFirst();
    if (!cfg) {
      cfg = await this.prisma.configuracaoClinica.create({ data: {} });
    }
    return cfg;
  }

  async update(
    dto: UpdateConfiguracaoDto,
    actor: { id: string; ip: string; traceId: string },
  ): Promise<ConfiguracaoClinica> {
    const atual = await this.get();

    const abertura = dto.horaAbertura ?? atual.horaAbertura;
    const fechamento = dto.horaFechamento ?? atual.horaFechamento;
    if (this.minutos(abertura) >= this.minutos(fechamento)) {
      throw new BadRequestException({
        code: 'HORARIO_INVALIDO',
        message: 'horaAbertura deve ser anterior a horaFechamento',
      });
    }

    const almocoIni =
      dto.intervaloAlmocoIni === undefined
        ? atual.intervaloAlmocoIni
        : dto.intervaloAlmocoIni;
    const almocoFim =
      dto.intervaloAlmocoFim === undefined
        ? atual.intervaloAlmocoFim
        : dto.intervaloAlmocoFim;

    if (almocoIni && !almocoFim) {
      throw new BadRequestException({
        code: 'ALMOCO_INCOMPLETO',
        message: 'intervaloAlmocoFim é obrigatório se intervaloAlmocoIni for definido',
      });
    }
    if (almocoFim && !almocoIni) {
      throw new BadRequestException({
        code: 'ALMOCO_INCOMPLETO',
        message: 'intervaloAlmocoIni é obrigatório se intervaloAlmocoFim for definido',
      });
    }
    if (
      almocoIni &&
      almocoFim &&
      this.minutos(almocoIni) >= this.minutos(almocoFim)
    ) {
      throw new BadRequestException({
        code: 'ALMOCO_INVALIDO',
        message: 'intervaloAlmocoIni deve ser anterior a intervaloAlmocoFim',
      });
    }

    const updated = await this.prisma.configuracaoClinica.update({
      where: { id: atual.id },
      data: {
        ...(dto.nomeClinica !== undefined ? { nomeClinica: dto.nomeClinica } : {}),
        ...(dto.horaAbertura !== undefined
          ? { horaAbertura: dto.horaAbertura }
          : {}),
        ...(dto.horaFechamento !== undefined
          ? { horaFechamento: dto.horaFechamento }
          : {}),
        ...(dto.diasFuncionamento !== undefined
          ? { diasFuncionamento: dto.diasFuncionamento }
          : {}),
        ...(dto.duracaoConsultaMin !== undefined
          ? { duracaoConsultaMin: dto.duracaoConsultaMin }
          : {}),
        ...(dto.intervaloAlmocoIni !== undefined
          ? { intervaloAlmocoIni: dto.intervaloAlmocoIni }
          : {}),
        ...(dto.intervaloAlmocoFim !== undefined
          ? { intervaloAlmocoFim: dto.intervaloAlmocoFim }
          : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        atualizadoPor: actor.id,
      },
    });

    await this.audit.log({
      usuarioId: actor.id,
      acao: 'CONFIGURACAO_ATUALIZADA',
      entidade: 'ConfiguracaoClinica',
      registroId: atual.id,
      ipDispositivo: actor.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: actor.traceId,
      detalhes: { mudancas: JSON.parse(JSON.stringify(dto)) },
    });

    return updated;
  }

  private minutos(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}
