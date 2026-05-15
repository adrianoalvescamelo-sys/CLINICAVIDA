import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  AuditResultado,
  PerfilTipo,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentosDto } from './dto/query-agendamentos.dto';
import { CreateBloqueioDto } from './dto/bloqueio.dto';

const STATUS_ATIVOS: AgendamentoStatus[] = [
  AgendamentoStatus.SOLICITADO,
  AgendamentoStatus.PRE_AGENDAMENTO,
  AgendamentoStatus.CONFIRMADO,
  AgendamentoStatus.CONFIRMACAO_TARDIA,
  AgendamentoStatus.AGUARDANDO,
  AgendamentoStatus.EM_ATENDIMENTO,
];

const LIMITE_AUTO_HORAS = 2;

interface CallerCtx {
  usuarioId: string;
  perfil: PerfilTipo;
  ip: string;
  traceId: string;
}

interface CreateOptions {
  origem: AgendamentoOrigem;
  statusInicial?: AgendamentoStatus;
  eventId?: string;
}

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateAgendamentoDto, ctx: CallerCtx, opt: CreateOptions) {
    const inicio = new Date(dto.dataHoraInicio);
    const fim = new Date(dto.dataHoraFim);
    this.validarIntervalo(inicio, fim);

    if (opt.eventId) {
      const existente = await this.prisma.agendamento.findUnique({
        where: { eventId: opt.eventId },
      });
      if (existente) return existente;
    }

    const paciente = await this.prisma.paciente.findFirst({
      where: { id: dto.pacienteId, deletedAt: null },
      select: { id: true },
    });
    if (!paciente) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }

    const profissional = await this.prisma.profissional.findUnique({
      where: { id: dto.profissionalId },
      select: { id: true, ativo: true },
    });
    if (!profissional || !profissional.ativo) {
      throw new NotFoundException({
        code: 'PROFISSIONAL_NAO_ENCONTRADO',
        message: 'Profissional não encontrado ou inativo',
      });
    }

    const status = opt.statusInicial ?? AgendamentoStatus.SOLICITADO;

    return this.prisma.$transaction(async (tx) => {
      const conflito = await tx.agendamento.findFirst({
        where: {
          profissionalId: dto.profissionalId,
          status: { in: STATUS_ATIVOS },
          dataHoraInicio: { lt: fim },
          dataHoraFim: { gt: inicio },
        },
        select: { id: true, dataHoraInicio: true, dataHoraFim: true },
      });

      if (conflito && !dto.encaixe) {
        throw new ConflictException({
          code: 'HORARIO_OCUPADO',
          message:
            'Já existe agendamento neste horário. Use encaixe para forçar.',
          details: { conflitoCom: conflito },
        });
      }

      const bloqueio = await tx.bloqueioAgenda.findFirst({
        where: {
          profissionalId: dto.profissionalId,
          dataHoraInicio: { lt: fim },
          dataHoraFim: { gt: inicio },
        },
      });
      if (bloqueio && !dto.encaixe) {
        throw new ConflictException({
          code: 'HORARIO_BLOQUEADO',
          message: 'Horário bloqueado pelo profissional',
          details: { bloqueio },
        });
      }

      const choquePaciente = await tx.agendamento.findFirst({
        where: {
          pacienteId: dto.pacienteId,
          status: { in: STATUS_ATIVOS },
          dataHoraInicio: { lt: fim },
          dataHoraFim: { gt: inicio },
        },
        select: { id: true },
      });
      if (choquePaciente) {
        throw new ConflictException({
          code: 'PACIENTE_COM_AGENDAMENTO',
          message: 'Paciente já tem outro agendamento neste horário',
        });
      }

      const ag = await tx.agendamento.create({
        data: {
          pacienteId: dto.pacienteId,
          profissionalId: dto.profissionalId,
          dataHoraInicio: inicio,
          dataHoraFim: fim,
          tipo: dto.tipo,
          status,
          origem: opt.origem,
          encaixe: !!dto.encaixe,
          observacoes: dto.observacoes,
          eventId: opt.eventId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        },
      });

      await tx.agendamentoHistorico.create({
        data: {
          agendamentoId: ag.id,
          usuarioId: ctx.usuarioId,
          acao: 'CREATE',
          statusNovo: status,
          diff: dto as unknown as Prisma.InputJsonValue,
          traceId: ctx.traceId,
        },
      });

      return ag;
    });
  }

  findAll(query: QueryAgendamentosDto) {
    const where: Prisma.AgendamentoWhereInput = {};
    if (query.profissionalId) where.profissionalId = query.profissionalId;
    if (query.pacienteId) where.pacienteId = query.pacienteId;
    if (query.status) where.status = query.status;
    if (query.inicio || query.fim) {
      where.dataHoraInicio = {};
      if (query.inicio)
        (where.dataHoraInicio as Prisma.DateTimeFilter).gte = new Date(
          query.inicio,
        );
      if (query.fim)
        (where.dataHoraInicio as Prisma.DateTimeFilter).lte = new Date(
          query.fim,
        );
    }

    return this.prisma.agendamento.findMany({
      where,
      orderBy: { dataHoraInicio: 'asc' },
      include: {
        paciente: {
          select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
        },
        profissional: { select: { id: true, nomeCompleto: true, cor: true } },
      },
      take: 500,
    });
  }

  async findOne(id: string) {
    const ag = await this.prisma.agendamento.findUnique({
      where: { id },
      include: {
        paciente: true,
        profissional: true,
      },
    });
    if (!ag) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NAO_ENCONTRADO',
        message: 'Agendamento não encontrado',
      });
    }
    return ag;
  }

  async update(
    id: string,
    dto: UpdateAgendamentoDto,
    ctx: CallerCtx,
    origemAlteracao: AgendamentoOrigem = AgendamentoOrigem.RECEPCAO,
  ) {
    const atual = await this.findOne(id);

    if (dto.updatedAt) {
      if (new Date(dto.updatedAt).getTime() !== atual.updatedAt.getTime()) {
        throw new ConflictException({
          code: 'CONCURRENT_UPDATE',
          message: 'Agendamento foi alterado por outro usuário',
          details: { atualizadoEm: atual.updatedAt },
        });
      }
    }

    const novoStatus = dto.status ?? atual.status;
    this.validarTransicaoStatus(atual.status, novoStatus);

    const novoInicio = dto.dataHoraInicio
      ? new Date(dto.dataHoraInicio)
      : atual.dataHoraInicio;
    const novoFim = dto.dataHoraFim
      ? new Date(dto.dataHoraFim)
      : atual.dataHoraFim;
    const novoProfId = dto.profissionalId ?? atual.profissionalId;

    if (
      dto.dataHoraInicio ||
      dto.dataHoraFim ||
      (dto.profissionalId && dto.profissionalId !== atual.profissionalId)
    ) {
      this.validarIntervalo(novoInicio, novoFim);

      const isAutoCancelOuRemarc =
        origemAlteracao === AgendamentoOrigem.PACIENTE_WHATSAPP &&
        (novoStatus === AgendamentoStatus.CANCELADO || !!dto.dataHoraInicio);
      if (isAutoCancelOuRemarc) {
        const horasAte =
          (atual.dataHoraInicio.getTime() - Date.now()) / 3_600_000;
        if (horasAte < LIMITE_AUTO_HORAS) {
          throw new BadRequestException({
            code: 'LIMITE_AUTOMACAO_EXPIRADO',
            message:
              'Limite de 2h para alteração automática expirado. Necessária aprovação manual da recepção.',
          });
        }
      }

      const conflito = await this.prisma.agendamento.findFirst({
        where: {
          id: { not: id },
          profissionalId: novoProfId,
          status: { in: STATUS_ATIVOS },
          dataHoraInicio: { lt: novoFim },
          dataHoraFim: { gt: novoInicio },
        },
      });
      if (conflito) {
        throw new ConflictException({
          code: 'HORARIO_OCUPADO',
          message: 'Novo horário conflita com outro agendamento',
          details: { conflitoCom: { id: conflito.id } },
        });
      }
    }

    const data: Prisma.AgendamentoUpdateInput = {
      atualizadoPor: ctx.usuarioId,
    };
    if (dto.dataHoraInicio) data.dataHoraInicio = novoInicio;
    if (dto.dataHoraFim) data.dataHoraFim = novoFim;
    if (dto.profissionalId)
      data.profissional = { connect: { id: dto.profissionalId } };
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes;
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === AgendamentoStatus.CONFIRMADO)
        data.confirmadoEm = new Date();
      if (dto.status === AgendamentoStatus.CANCELADO) {
        data.canceladoEm = new Date();
        data.motivoCancelamento = dto.motivoCancelamento;
      }
    }

    const atualizado = await this.prisma.agendamento.update({
      where: { id },
      data,
    });

    await this.prisma.agendamentoHistorico.create({
      data: {
        agendamentoId: id,
        usuarioId: ctx.usuarioId,
        acao: dto.status ? `STATUS:${dto.status}` : 'UPDATE',
        statusAnterior: atual.status,
        statusNovo: atualizado.status,
        diff: dto as unknown as Prisma.InputJsonValue,
        traceId: ctx.traceId,
      },
    });

    await this.audit.log({
      usuarioId: ctx.usuarioId,
      acao: 'UPDATE',
      entidade: 'Agendamento',
      registroId: id,
      ipDispositivo: ctx.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: ctx.traceId,
      detalhes: { de: atual.status, para: atualizado.status },
    });

    return atualizado;
  }

  async chamar(id: string, ctx: CallerCtx) {
    return this.update(id, { status: AgendamentoStatus.EM_ATENDIMENTO }, ctx);
  }

  async marcarAtendido(id: string, ctx: CallerCtx) {
    return this.update(id, { status: AgendamentoStatus.ATENDIDO }, ctx);
  }

  async marcarFalta(id: string, ctx: CallerCtx) {
    return this.update(id, { status: AgendamentoStatus.FALTOU }, ctx);
  }

  async criarBloqueio(
    dto: CreateBloqueioDto,
    ctx: CallerCtx,
    profissionalDoCaller?: string,
  ) {
    if (
      ctx.perfil !== PerfilTipo.ADMIN &&
      profissionalDoCaller !== dto.profissionalId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Profissional só pode bloquear a própria agenda',
      });
    }

    const inicio = new Date(dto.dataHoraInicio);
    const fim = new Date(dto.dataHoraFim);
    this.validarIntervalo(inicio, fim);

    const conflito = await this.prisma.agendamento.findFirst({
      where: {
        profissionalId: dto.profissionalId,
        status: { in: STATUS_ATIVOS },
        dataHoraInicio: { lt: fim },
        dataHoraFim: { gt: inicio },
      },
    });
    if (conflito) {
      throw new ConflictException({
        code: 'AGENDAMENTO_NO_BLOQUEIO',
        message:
          'Há agendamentos ativos neste período. Remarque ou peça admin.',
        details: { conflitoCom: { id: conflito.id } },
      });
    }

    return this.prisma.bloqueioAgenda.create({
      data: {
        profissionalId: dto.profissionalId,
        dataHoraInicio: inicio,
        dataHoraFim: fim,
        motivo: dto.motivo,
        criadoPor: ctx.usuarioId,
      },
    });
  }

  async listarBloqueios(profissionalId?: string) {
    return this.prisma.bloqueioAgenda.findMany({
      where: profissionalId ? { profissionalId } : undefined,
      orderBy: { dataHoraInicio: 'asc' },
    });
  }

  async removerBloqueio(
    id: string,
    ctx: CallerCtx,
    profissionalDoCaller?: string,
  ) {
    const b = await this.prisma.bloqueioAgenda.findUnique({ where: { id } });
    if (!b) {
      throw new NotFoundException({
        code: 'BLOQUEIO_NAO_ENCONTRADO',
        message: 'Bloqueio não encontrado',
      });
    }
    if (
      ctx.perfil !== PerfilTipo.ADMIN &&
      profissionalDoCaller !== b.profissionalId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Sem permissão para remover bloqueio',
      });
    }
    await this.prisma.bloqueioAgenda.delete({ where: { id } });
  }

  private validarIntervalo(inicio: Date, fim: Date) {
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException({
        code: 'DATA_INVALIDA',
        message: 'Datas inválidas',
      });
    }
    if (fim <= inicio) {
      throw new BadRequestException({
        code: 'INTERVALO_INVALIDO',
        message: 'data_hora_fim deve ser posterior a data_hora_inicio',
      });
    }
  }

  private validarTransicaoStatus(
    de: AgendamentoStatus,
    para: AgendamentoStatus,
  ) {
    if (de === para) return;
    const proibidasFinais: AgendamentoStatus[] = [
      AgendamentoStatus.ATENDIDO,
      AgendamentoStatus.CANCELADO,
      AgendamentoStatus.FALTOU,
    ];
    if (proibidasFinais.includes(de)) {
      throw new BadRequestException({
        code: 'TRANSICAO_INVALIDA',
        message: `Não é possível alterar status a partir de ${de}`,
      });
    }
  }
}
