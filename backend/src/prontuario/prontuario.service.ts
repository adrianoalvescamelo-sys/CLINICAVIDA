import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CriarEvolucaoDto } from './dto/criar-evolucao.dto';
import { RetificarEvolucaoDto } from './dto/retificar-evolucao.dto';

@Injectable()
export class ProntuarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ehMedico(user: AuthUser): Promise<boolean> {
    const prof = await this.prisma.profissional.findUnique({
      where: { usuarioId: user.id },
      select: { ehMedico: true },
    });
    if (prof) return prof.ehMedico;
    return user.perfil === 'MEDICO';
  }

  private isMedicoOuAdmin(user: AuthUser): boolean {
    return user.perfil === 'MEDICO' || user.perfil === 'ADMIN';
  }

  async listarProntuario(
    pacienteId: string,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const pront = await this.prisma.prontuario.findUnique({
      where: { pacienteId },
    });

    let evolucoes: unknown[] = [];
    if (pront) {
      const where: Prisma.EvolucaoWhereInput = {
        prontuarioId: pront.id,
        replacedBy: null, // apenas versões atuais
      };
      if (!this.isMedicoOuAdmin(user)) {
        where.autorUsuarioId = user.id;
      }
      evolucoes = await this.prisma.evolucao.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_PRONTUARIO',
      entidade: 'Prontuario',
      registroId: pront?.id ?? null,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId } as Prisma.InputJsonValue,
    });

    return { prontuario: pront, evolucoes };
  }

  async obterEvolucao(
    evolucaoId: string,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const evo = await this.prisma.evolucao.findUnique({
      where: { id: evolucaoId },
      include: { replaces: true, replacedBy: true },
    });
    // não-médico só acessa as próprias → trata como inexistente (404)
    if (
      !evo ||
      (!this.isMedicoOuAdmin(user) && evo.autorUsuarioId !== user.id)
    ) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NAO_ENCONTRADA',
        message: 'Evolução não encontrada',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: evo.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return evo;
  }

  async criarEvolucao(
    pacienteId: string,
    dto: CriarEvolucaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const ag = await this.prisma.agendamento.findUnique({
      where: { id: dto.agendamentoId },
      select: { id: true, pacienteId: true },
    });
    if (!ag || ag.pacienteId !== pacienteId) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_INVALIDO',
        message: 'Agendamento não pertence ao paciente',
      });
    }

    const autorEhMedico = await this.ehMedico(user);

    const evolucao = await this.prisma.$transaction(async (tx) => {
      let pront = await tx.prontuario.findUnique({ where: { pacienteId } });
      if (!pront) {
        pront = await tx.prontuario.create({ data: { pacienteId } });
      }
      return tx.evolucao.create({
        data: {
          prontuarioId: pront.id,
          agendamentoId: dto.agendamentoId,
          autorUsuarioId: user.id,
          autorEhMedico,
          queixaPrincipal: dto.queixaPrincipal,
          subjetivo: dto.subjetivo,
          objetivo: dto.objetivo,
          avaliacao: dto.avaliacao,
          plano: dto.plano,
          versao: 1,
        },
      });
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'CRIACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: evolucao.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: {
        pacienteId,
        agendamentoId: dto.agendamentoId,
      } as Prisma.InputJsonValue,
    });

    return evolucao;
  }

  async retificar(
    evolucaoId: string,
    dto: RetificarEvolucaoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const orig = await this.prisma.evolucao.findUnique({
      where: { id: evolucaoId },
      include: { replacedBy: true },
    });
    if (!orig) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NAO_ENCONTRADA',
        message: 'Evolução não encontrada',
      });
    }
    if (orig.autorUsuarioId !== user.id) {
      throw new ForbiddenException({
        code: 'NAO_AUTOR',
        message: 'Apenas o autor pode retificar a evolução',
      });
    }
    if (orig.replacedBy) {
      throw new ConflictException({
        code: 'VERSAO_NAO_ATUAL',
        message: 'Esta evolução já foi retificada',
      });
    }

    const nova = await this.prisma.$transaction((tx) =>
      tx.evolucao.create({
        data: {
          prontuarioId: orig.prontuarioId,
          agendamentoId: orig.agendamentoId,
          autorUsuarioId: orig.autorUsuarioId,
          autorEhMedico: orig.autorEhMedico,
          queixaPrincipal: dto.queixaPrincipal,
          subjetivo: dto.subjetivo,
          objetivo: dto.objetivo,
          avaliacao: dto.avaliacao,
          plano: dto.plano,
          versao: orig.versao + 1,
          replacesId: orig.id,
        },
      }),
    );

    await this.audit.log({
      usuarioId: user.id,
      acao: 'RETIFICACAO_EVOLUCAO',
      entidade: 'Evolucao',
      registroId: nova.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: {
        retificaId: orig.id,
        versao: nova.versao,
      } as Prisma.InputJsonValue,
    });

    return nova;
  }
}
