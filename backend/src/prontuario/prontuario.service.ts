import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditResultado, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CriarEvolucaoDto } from './dto/criar-evolucao.dto';

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
}
