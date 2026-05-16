import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, ListaEsperaStatus, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListaEsperaDto } from './dto/create-lista-espera.dto';
import { QueryListaEsperaDto } from './dto/query-lista-espera.dto';
import {
  RegistrarRecusaDto,
  UpdateListaEsperaDto,
} from './dto/update-lista-espera.dto';

const STATUS_ATIVOS: ListaEsperaStatus[] = [
  ListaEsperaStatus.ATIVO,
  ListaEsperaStatus.CONTATADO,
];

const STATUS_FINAIS: ListaEsperaStatus[] = [
  ListaEsperaStatus.RECUSADO,
  ListaEsperaStatus.AGENDADO,
  ListaEsperaStatus.CANCELADO,
];

interface CallerCtx {
  usuarioId: string;
  ip: string;
  traceId: string;
}

@Injectable()
export class ListaEsperaService {
  private readonly includeResumo = {
    paciente: {
      select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
    },
    profissional: {
      select: { id: true, nomeCompleto: true, especialidade: true },
    },
  } satisfies Prisma.ListaEsperaInclude;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateListaEsperaDto, ctx: CallerCtx) {
    await this.assertPaciente(dto.pacienteId);
    await this.assertProfissional(dto.profissionalId);
    await this.assertSemDuplicidade({
      pacienteId: dto.pacienteId,
      profissionalId: dto.profissionalId,
      especialidade: dto.especialidade,
      status: ListaEsperaStatus.ATIVO,
    });

    const item = await this.mapDuplicidade(() =>
      this.prisma.listaEspera.create({
        data: {
          pacienteId: dto.pacienteId,
          profissionalId: dto.profissionalId,
          especialidade: dto.especialidade,
          prioridade: dto.prioridade,
          melhoresHorarios: dto.melhoresHorarios as Prisma.InputJsonValue,
          observacoes: dto.observacoes,
          status: ListaEsperaStatus.ATIVO,
          criadoPor: ctx.usuarioId,
        },
        include: this.includeResumo,
      }),
    );

    await this.registrarAuditoria('CREATE', item.id, ctx, {
      prioridade: item.prioridade,
    });

    return item;
  }

  findAll(query: QueryListaEsperaDto) {
    const where: Prisma.ListaEsperaWhereInput = {
      status: query.status ?? ListaEsperaStatus.ATIVO,
    };

    if (query.pacienteId) where.pacienteId = query.pacienteId;
    if (query.profissionalId) where.profissionalId = query.profissionalId;
    if (query.especialidade) {
      where.especialidade = {
        contains: query.especialidade,
        mode: 'insensitive',
      };
    }

    return this.prisma.listaEspera.findMany({
      where,
      include: this.includeResumo,
      orderBy: [{ prioridade: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    });
  }

  async update(id: string, dto: UpdateListaEsperaDto, ctx: CallerCtx) {
    const atual = await this.findOne(id);
    const profissionalId =
      dto.profissionalId !== undefined
        ? dto.profissionalId
        : atual.profissionalId;
    const especialidade =
      dto.especialidade !== undefined ? dto.especialidade : atual.especialidade;
    const status = dto.status ?? atual.status;

    if (dto.profissionalId !== undefined) {
      await this.assertProfissional(dto.profissionalId);
    }

    if (STATUS_ATIVOS.includes(status)) {
      await this.assertSemDuplicidade(
        {
          pacienteId: atual.pacienteId,
          profissionalId,
          especialidade,
          status,
        },
        id,
      );
    }

    const data: Prisma.ListaEsperaUpdateInput = {};
    if (dto.profissionalId !== undefined) {
      data.profissional = dto.profissionalId
        ? { connect: { id: dto.profissionalId } }
        : { disconnect: true };
    }
    if (dto.especialidade !== undefined) data.especialidade = dto.especialidade;
    if (dto.prioridade !== undefined) data.prioridade = dto.prioridade;
    if (dto.melhoresHorarios !== undefined) {
      data.melhoresHorarios = dto.melhoresHorarios as Prisma.InputJsonValue;
    }
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes;
    if (dto.status !== undefined) {
      this.validarTransicao(atual.status, dto.status);
      data.status = dto.status;
      this.aplicarDatasDeStatus(data, dto.status);
    }

    const item = await this.mapDuplicidade(() =>
      this.prisma.listaEspera.update({
        where: { id },
        data,
        include: this.includeResumo,
      }),
    );

    await this.registrarAuditoria('UPDATE', id, ctx, {
      statusAnterior: atual.status,
      statusNovo: item.status,
    });

    return item;
  }

  async ofertarVaga(id: string, ctx: CallerCtx) {
    const atual = await this.findOne(id);
    this.validarTransicao(atual.status, ListaEsperaStatus.CONTATADO);
    const item = await this.prisma.listaEspera.update({
      where: { id },
      data: {
        status: ListaEsperaStatus.CONTATADO,
        ultimaOfertaEm: new Date(),
      },
      include: this.includeResumo,
    });
    await this.registrarAuditoria('OFERTAR_VAGA', id, ctx);
    return item;
  }

  async registrarRecusa(id: string, dto: RegistrarRecusaDto, ctx: CallerCtx) {
    const atual = await this.findOne(id);
    this.validarTransicao(atual.status, ListaEsperaStatus.RECUSADO);
    const item = await this.prisma.listaEspera.update({
      where: { id },
      data: {
        status: ListaEsperaStatus.RECUSADO,
        ultimaRespostaEm: new Date(),
        motivoRecusa: dto.motivoRecusa,
      },
      include: this.includeResumo,
    });
    await this.registrarAuditoria('REGISTRAR_RECUSA', id, ctx);
    return item;
  }

  async marcarAgendado(id: string, ctx: CallerCtx) {
    const atual = await this.findOne(id);
    this.validarTransicao(atual.status, ListaEsperaStatus.AGENDADO);
    const item = await this.prisma.listaEspera.update({
      where: { id },
      data: {
        status: ListaEsperaStatus.AGENDADO,
        ultimaRespostaEm: new Date(),
      },
      include: this.includeResumo,
    });
    await this.registrarAuditoria('MARCAR_AGENDADO', id, ctx);
    return item;
  }

  private async findOne(id: string) {
    const item = await this.prisma.listaEspera.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({
        code: 'LISTA_ESPERA_NAO_ENCONTRADA',
        message: 'Item da lista de espera não encontrado',
      });
    }
    return item;
  }

  private async assertPaciente(pacienteId: string) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, deletedAt: null },
      select: { id: true },
    });
    if (!paciente) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }
  }

  private async assertProfissional(profissionalId?: string | null) {
    if (!profissionalId) return;
    const profissional = await this.prisma.profissional.findUnique({
      where: { id: profissionalId },
      select: { id: true, ativo: true },
    });
    if (!profissional || !profissional.ativo) {
      throw new NotFoundException({
        code: 'PROFISSIONAL_NAO_ENCONTRADO',
        message: 'Profissional não encontrado ou inativo',
      });
    }
  }

  private async assertSemDuplicidade(
    params: {
      pacienteId: string;
      profissionalId?: string | null;
      especialidade?: string | null;
      status: ListaEsperaStatus;
    },
    ignoreId?: string,
  ) {
    if (!STATUS_ATIVOS.includes(params.status)) return;

    const existente = await this.prisma.listaEspera.findFirst({
      where: {
        id: ignoreId ? { not: ignoreId } : undefined,
        pacienteId: params.pacienteId,
        profissionalId: params.profissionalId ?? null,
        especialidade: params.especialidade ?? null,
        status: { in: STATUS_ATIVOS },
      },
      select: { id: true },
    });

    if (existente) this.throwDuplicidade(existente.id);
  }

  private validarTransicao(de: ListaEsperaStatus, para: ListaEsperaStatus) {
    if (de === para) return;
    if (STATUS_FINAIS.includes(de)) {
      throw new ConflictException({
        code: 'TRANSICAO_LISTA_ESPERA_INVALIDA',
        message: `Não é possível alterar lista de espera a partir de ${de}`,
      });
    }

    const permitidas: Record<ListaEsperaStatus, ListaEsperaStatus[]> = {
      [ListaEsperaStatus.ATIVO]: [
        ListaEsperaStatus.CONTATADO,
        ListaEsperaStatus.RECUSADO,
        ListaEsperaStatus.AGENDADO,
        ListaEsperaStatus.CANCELADO,
      ],
      [ListaEsperaStatus.CONTATADO]: [
        ListaEsperaStatus.RECUSADO,
        ListaEsperaStatus.AGENDADO,
        ListaEsperaStatus.CANCELADO,
      ],
      [ListaEsperaStatus.RECUSADO]: [],
      [ListaEsperaStatus.AGENDADO]: [],
      [ListaEsperaStatus.CANCELADO]: [],
    };

    if (!permitidas[de].includes(para)) {
      throw new ConflictException({
        code: 'TRANSICAO_LISTA_ESPERA_INVALIDA',
        message: `Transição de ${de} para ${para} não permitida`,
      });
    }
  }

  private aplicarDatasDeStatus(
    data: Prisma.ListaEsperaUpdateInput,
    status: ListaEsperaStatus,
  ) {
    if (status === ListaEsperaStatus.CONTATADO) {
      data.ultimaOfertaEm = new Date();
    }
    if (STATUS_FINAIS.includes(status)) {
      data.ultimaRespostaEm = new Date();
    }
  }

  private async mapDuplicidade<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.throwDuplicidade();
      }
      throw error;
    }
  }

  private throwDuplicidade(existenteId?: string): never {
    throw new ConflictException({
      code: 'LISTA_ESPERA_DUPLICADA',
      message: 'Paciente ja esta na lista de espera para este servico',
      details: existenteId ? { existenteId } : undefined,
    });
  }

  private registrarAuditoria(
    acao: string,
    registroId: string,
    ctx: CallerCtx,
    detalhes?: Record<string, unknown>,
  ) {
    return this.audit.log({
      usuarioId: ctx.usuarioId,
      acao,
      entidade: 'ListaEspera',
      registroId,
      ipDispositivo: ctx.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: ctx.traceId,
      detalhes: detalhes as Prisma.InputJsonValue | undefined,
    });
  }
}
