import { Injectable } from '@nestjs/common';
import {
  AgendamentoStatus,
  ListaEsperaStatus,
  MensagemDirecao,
  MensagemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

const CONFIRMACOES_PENDENTES: AgendamentoStatus[] = [
  AgendamentoStatus.SOLICITADO,
  AgendamentoStatus.PRE_AGENDAMENTO,
  AgendamentoStatus.CONFIRMACAO_TARDIA,
];

const CLINIC_TIMEZONE = 'America/Cuiaba';

@Injectable()
export class RecepcaoService {
  private readonly includeAgendamentoResumo = {
    paciente: {
      select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
    },
    profissional: {
      select: { id: true, nomeCompleto: true, cor: true },
    },
  } satisfies Prisma.AgendamentoInclude;

  private readonly includeListaEsperaResumo = {
    paciente: {
      select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
    },
    profissional: {
      select: { id: true, nomeCompleto: true, especialidade: true },
    },
  } satisfies Prisma.ListaEsperaInclude;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Painel TV — exibe chamada atual + próximos 3 da fila.
   * Endpoint público interno (autenticado via TvAuthGuard).
   * Nome completo sem truncamento (CLAUDE.md: "Painel TV exibe nome completo").
   */
  async painelTV(data?: string) {
    const dataAlvo = data ?? this.todayInClinicTimezone();
    const { start, end } = this.dayRange(dataAlvo);

    const selectResumido = {
      id: true,
      dataHoraInicio: true,
      paciente: { select: { nomeCompleto: true } },
      profissional: { select: { nomeCompleto: true } },
    } satisfies Prisma.AgendamentoSelect;

    const [chamadoAgora, proximos] = await this.prisma.$transaction([
      this.prisma.agendamento.findFirst({
        where: {
          dataHoraInicio: { gte: start, lt: end },
          status: AgendamentoStatus.EM_ATENDIMENTO,
        },
        select: selectResumido,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          dataHoraInicio: { gte: start, lt: end },
          status: AgendamentoStatus.AGUARDANDO,
        },
        select: selectResumido,
        orderBy: { dataHoraInicio: 'asc' },
        take: 3,
      }),
    ]);

    return {
      chamadoAgora,
      proximos,
      generatedAt: new Date().toISOString(),
    };
  }

  private todayInClinicTimezone(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLINIC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return parts;
  }

  async dashboard(query: QueryDashboardDto) {
    const { start, end } = this.dayRange(query.data);
    const dayWhere = this.agendamentoWhere(query, start, end);
    const profissionalWhere = query.profissionalId
      ? { profissionalId: query.profissionalId }
      : {};

    const [
      agendaDoDia,
      aguardando,
      confirmacoesPendentes,
      emAtendimento,
      mensagensPendentes,
      listaEspera,
      contagemRaw,
    ] = await this.prisma.$transaction([
      this.prisma.agendamento.findMany({
        where: dayWhere,
        include: this.includeAgendamentoResumo,
        orderBy: { dataHoraInicio: 'asc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          ...profissionalWhere,
          dataHoraInicio: { gte: start, lt: end },
          status: AgendamentoStatus.AGUARDANDO,
        },
        include: this.includeAgendamentoResumo,
        orderBy: { dataHoraInicio: 'asc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          ...profissionalWhere,
          dataHoraInicio: { gte: start, lt: end },
          status: { in: CONFIRMACOES_PENDENTES },
        },
        include: this.includeAgendamentoResumo,
        orderBy: { dataHoraInicio: 'asc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          ...profissionalWhere,
          dataHoraInicio: { gte: start, lt: end },
          status: AgendamentoStatus.EM_ATENDIMENTO,
        },
        include: this.includeAgendamentoResumo,
        orderBy: { dataHoraInicio: 'asc' },
      }),
      this.prisma.mensagemWhatsapp.findMany({
        where: {
          direcao: MensagemDirecao.OUTBOUND,
          status: { in: [MensagemStatus.PENDENTE, MensagemStatus.FALHA] },
          agendamento: {
            is: {
              ...profissionalWhere,
              dataHoraInicio: { gte: start, lt: end },
            },
          },
        },
        include: {
          paciente: {
            select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
          },
          agendamento: {
            include: this.includeAgendamentoResumo,
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.listaEspera.findMany({
        where: {
          ...profissionalWhere,
          status: {
            in: [ListaEsperaStatus.ATIVO, ListaEsperaStatus.CONTATADO],
          },
        },
        include: this.includeListaEsperaResumo,
        orderBy: [{ prioridade: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      }),
      this.prisma.agendamento.groupBy({
        by: ['status'],
        where: dayWhere,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    const contagemPorStatus = Object.values(AgendamentoStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<AgendamentoStatus, number>,
    );
    for (const row of contagemRaw) {
      const c = row._count;
      contagemPorStatus[row.status] =
        typeof c === 'object' && c !== null && '_all' in c ? (c._all ?? 0) : 0;
    }

    return {
      agendaDoDia,
      aguardando,
      confirmacoesPendentes,
      emAtendimento,
      mensagensPendentes,
      listaEspera,
      contagemPorStatus,
      totalAgenda: agendaDoDia.length,
      generatedAt: new Date().toISOString(),
    };
  }

  private agendamentoWhere(
    query: QueryDashboardDto,
    start: Date,
    end: Date,
  ): Prisma.AgendamentoWhereInput {
    return {
      dataHoraInicio: { gte: start, lt: end },
      profissionalId: query.profissionalId,
      status: query.status,
    };
  }

  private dayRange(data: string) {
    const [year, month, day] = data.slice(0, 10).split('-').map(Number);
    const start = this.localTimeToUtc(year, month, day, 0, 0, 0);
    const end = this.localTimeToUtc(year, month, day + 1, 0, 0, 0);
    return { start, end };
  }

  private localTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const offset = this.timeZoneOffsetMs(new Date(utcGuess));
    return new Date(utcGuess - offset);
  }

  private timeZoneOffsetMs(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CLINIC_TIMEZONE,
      hour12: false,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    const asUtc = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
    return asUtc - date.getTime();
  }
}
