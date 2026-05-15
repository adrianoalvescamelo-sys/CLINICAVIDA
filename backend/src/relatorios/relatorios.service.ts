import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  PerfilTipo,
  Prisma,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { QueryRelatorioDto } from './dto/query-relatorio.dto';
import { QueryAgendaDiaDto } from './dto/query-agenda-dia.dto';

/** Máximo de dias para query síncrona. Acima disso recusa com 400. */
export const PERIODO_MAX_DIAS = 90;

const CLINIC_TIMEZONE = 'America/Cuiaba';

export interface CallerCtx {
  usuarioId: string;
  perfil: PerfilTipo;
  ip: string;
  traceId: string;
  profissionalId?: string; // preenchido para médico/prof. não médico
}

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------

function todayLocalString(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CLINIC_TIMEZONE }).format(
    new Date(),
  );
}

function parseDateLocal(dateStr: string, endOfDay = false): Date {
  // dateStr: YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  const hour = endOfDay ? 24 : 0;
  // Compute midnight local time → UTC
  const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const offset = tzOffsetMs(new Date(utcGuess));
  return new Date(utcGuess - offset);
}

function tzOffsetMs(date: Date): number {
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
  const v = Object.fromEntries(
    parts
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(
    v.year,
    v.month - 1,
    v.day,
    v.hour,
    v.minute,
    v.second,
  );
  return asUtc - date.getTime();
}

function resolveRange(inicio?: string, fim?: string) {
  const today = todayLocalString();
  const sevenDaysAgo = (() => {
    const d = new Date(parseDateLocal(today));
    d.setDate(d.getDate() - 7);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: CLINIC_TIMEZONE,
    }).format(d);
  })();

  const start = parseDateLocal(inicio ?? sevenDaysAgo);
  const end = parseDateLocal(fim ?? today, true); // end of day
  return {
    start,
    end,
    inicioDia: inicio ?? sevenDaysAgo,
    fimDia: fim ?? today,
  };
}

function daysDiff(inicio: string, fim: string): number {
  const a = new Date(inicio + 'T00:00:00Z');
  const b = new Date(fim + 'T00:00:00Z');
  return Math.abs((b.getTime() - a.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtDatetime(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIMEZONE,
    dateStyle: 'short',
  }).format(d);
}

// ---------------------------------------------------------------------------
// Prisma select shapes
// ---------------------------------------------------------------------------

const agendamentoSelect = {
  id: true,
  dataHoraInicio: true,
  dataHoraFim: true,
  tipo: true,
  status: true,
  origem: true,
  encaixe: true,
  paciente: { select: { id: true, nomeCompleto: true } },
  profissional: {
    select: { id: true, nomeCompleto: true, especialidade: true },
  },
} satisfies Prisma.AgendamentoSelect;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // 1. Agenda do dia
  // -------------------------------------------------------------------------

  async agendaDia(dto: QueryAgendaDiaDto, ctx: CallerCtx) {
    const today = todayLocalString();
    const data = dto.data ?? today;
    const start = parseDateLocal(data);
    const end = parseDateLocal(data, true);

    const where = this.buildAgendamentoWhere(
      { inicio: data, fim: data, profissionalId: dto.profissionalId },
      start,
      end,
      ctx,
    );

    const rows = await this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: { dataHoraInicio: 'asc' },
    });

    return {
      data,
      profissionalId: dto.profissionalId ?? null,
      total: rows.length,
      agendamentos: rows,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // 2. Agendamentos por status
  // -------------------------------------------------------------------------

  async agendamentosPorStatus(dto: QueryRelatorioDto, ctx: CallerCtx) {
    const { start, end, inicioDia, fimDia } = resolveRange(dto.inicio, dto.fim);
    this.assertPeriodo(inicioDia, fimDia);

    const where = this.buildAgendamentoWhere(dto, start, end, ctx);

    const rows = await this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: [{ status: 'asc' }, { dataHoraInicio: 'asc' }],
    });

    // Agrupar por status
    const byStatus: Record<
      string,
      { count: number; agendamentos: typeof rows }
    > = {};
    for (const ag of rows) {
      if (!byStatus[ag.status])
        byStatus[ag.status] = { count: 0, agendamentos: [] };
      byStatus[ag.status].count++;
      byStatus[ag.status].agendamentos.push(ag);
    }

    return {
      periodo: { inicio: inicioDia, fim: fimDia },
      profissionalId: dto.profissionalId ?? null,
      total: rows.length,
      porStatus: byStatus,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // 3. Pacientes cadastrados no período
  // -------------------------------------------------------------------------

  async pacientesCadastrados(dto: QueryRelatorioDto, ctx: CallerCtx) {
    this.assertNotProfissional(ctx, 'pacientes cadastrados');

    const { start, end, inicioDia, fimDia } = resolveRange(dto.inicio, dto.fim);
    this.assertPeriodo(inicioDia, fimDia);

    const rows = await this.prisma.paciente.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        dataNascimento: true,
        sexo: true,
        telefoneWhatsapp: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      periodo: { inicio: inicioDia, fim: fimDia },
      total: rows.length,
      pacientes: rows,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // 4. Origem dos agendamentos
  // -------------------------------------------------------------------------

  async origemAgendamentos(dto: QueryRelatorioDto, ctx: CallerCtx) {
    const { start, end, inicioDia, fimDia } = resolveRange(dto.inicio, dto.fim);
    this.assertPeriodo(inicioDia, fimDia);

    const where = this.buildAgendamentoWhere(dto, start, end, ctx);

    const rows = await this.prisma.agendamento.findMany({
      where,
      select: { origem: true, id: true },
      orderBy: { dataHoraInicio: 'asc' },
    });

    // Contagem por origem
    const counts: Record<string, number> = {};
    for (const ag of rows) {
      counts[ag.origem] = (counts[ag.origem] ?? 0) + 1;
    }

    const total = rows.length;
    const distribuicao = Object.entries(counts).map(([origem, count]) => ({
      origem: origem as AgendamentoOrigem,
      count,
      percentual: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }));

    distribuicao.sort((a, b) => b.count - a.count);

    return {
      periodo: { inicio: inicioDia, fim: fimDia },
      profissionalId: dto.profissionalId ?? null,
      total,
      distribuicao,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Exports — Excel
  // -------------------------------------------------------------------------

  async exportExcel(
    tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
    dto: QueryRelatorioDto & QueryAgendaDiaDto,
    ctx: CallerCtx,
  ): Promise<StreamableFile> {
    this.assertExportPermission(ctx);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Clínica Vida';
    workbook.created = new Date();

    switch (tipo) {
      case 'agenda-dia':
        await this.buildAgendaDiaSheet(workbook, dto, ctx);
        break;
      case 'agendamentos-status':
        await this.buildStatusSheet(workbook, dto, ctx);
        break;
      case 'pacientes':
        await this.buildPacientesSheet(workbook, dto, ctx);
        break;
      case 'origem':
        await this.buildOrigemSheet(workbook, dto, ctx);
        break;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const readable = Readable.from(Buffer.from(buffer));
    return new StreamableFile(readable, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="relatorio-${tipo}-${Date.now()}.xlsx"`,
    });
  }

  // -------------------------------------------------------------------------
  // Exports — PDF
  // -------------------------------------------------------------------------

  async exportPdf(
    tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
    dto: QueryRelatorioDto & QueryAgendaDiaDto,
    ctx: CallerCtx,
  ): Promise<StreamableFile> {
    this.assertExportPermission(ctx);

    const buffer = await this.buildPdf(tipo, dto, ctx);
    const readable = Readable.from(buffer);
    return new StreamableFile(readable, {
      type: 'application/pdf',
      disposition: `attachment; filename="relatorio-${tipo}-${Date.now()}.pdf"`,
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildAgendamentoWhere(
    dto: {
      inicio?: string;
      fim?: string;
      profissionalId?: string;
      status?: AgendamentoStatus;
    },
    start: Date,
    end: Date,
    ctx: CallerCtx,
  ): Prisma.AgendamentoWhereInput {
    const where: Prisma.AgendamentoWhereInput = {
      dataHoraInicio: { gte: start, lt: end },
    };

    // Médico/profissional só vê a própria agenda
    if (
      ctx.perfil === PerfilTipo.MEDICO ||
      ctx.perfil === PerfilTipo.PROFISSIONAL_NAO_MEDICO
    ) {
      where.profissionalId = ctx.profissionalId;
    } else if (dto.profissionalId) {
      where.profissionalId = dto.profissionalId;
    }

    if (dto.status) where.status = dto.status;

    return where;
  }

  private assertPeriodo(inicio: string, fim: string) {
    if (daysDiff(inicio, fim) > PERIODO_MAX_DIAS) {
      throw new BadRequestException({
        code: 'PERIODO_MUITO_LONGO',
        message: `Período máximo para relatórios síncronos é ${PERIODO_MAX_DIAS} dias. Reduza o intervalo.`,
        details: {
          limiteEmDias: PERIODO_MAX_DIAS,
          solicitado: { inicio, fim },
        },
      });
    }
  }

  private assertExportPermission(ctx: CallerCtx) {
    if (ctx.perfil !== PerfilTipo.ADMIN) {
      throw new ForbiddenException({
        code: 'EXPORT_FORBIDDEN',
        message: 'Apenas administradores podem exportar relatórios.',
      });
    }
  }

  private assertNotProfissional(ctx: CallerCtx, relatorio: string) {
    if (
      ctx.perfil === PerfilTipo.MEDICO ||
      ctx.perfil === PerfilTipo.PROFISSIONAL_NAO_MEDICO
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Profissionais não têm acesso ao relatório de ${relatorio}.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Excel sheet builders
  // -------------------------------------------------------------------------

  private async buildAgendaDiaSheet(
    wb: ExcelJS.Workbook,
    dto: QueryRelatorioDto & QueryAgendaDiaDto,
    ctx: CallerCtx,
  ) {
    const data = await this.agendaDia(dto, ctx);
    const ws = wb.addWorksheet('Agenda do Dia');
    ws.addRow(['Agenda do Dia — Clínica Vida']);
    ws.addRow([`Data: ${data.data}`, `Gerado em: ${fmtDatetime(new Date())}`]);
    ws.addRow([]);
    ws.addRow([
      '#',
      'Horário Início',
      'Horário Fim',
      'Paciente',
      'Profissional',
      'Especialidade',
      'Tipo',
      'Status',
      'Encaixe',
    ]);
    this.styleHeader(ws, 4);
    data.agendamentos.forEach((ag, i) => {
      ws.addRow([
        i + 1,
        fmtDatetime(ag.dataHoraInicio),
        fmtDatetime(ag.dataHoraFim),
        ag.paciente.nomeCompleto,
        ag.profissional.nomeCompleto,
        ag.profissional.especialidade ?? '',
        ag.tipo,
        ag.status,
        ag.encaixe ? 'Sim' : 'Não',
      ]);
    });
    ws.columns.forEach((col) => {
      col.width = 20;
    });
  }

  private async buildStatusSheet(
    wb: ExcelJS.Workbook,
    dto: QueryRelatorioDto,
    ctx: CallerCtx,
  ) {
    const data = await this.agendamentosPorStatus(dto, ctx);
    const ws = wb.addWorksheet('Agendamentos por Status');
    ws.addRow(['Agendamentos por Status — Clínica Vida']);
    ws.addRow([
      `Período: ${data.periodo.inicio} a ${data.periodo.fim}`,
      `Total: ${data.total}`,
    ]);
    ws.addRow([]);

    // Resumo
    ws.addRow(['Status', 'Quantidade']);
    this.styleHeader(ws, 4);
    for (const [status, info] of Object.entries(data.porStatus)) {
      ws.addRow([status, info.count]);
    }
    ws.addRow([]);

    // Detalhe
    ws.addRow(['Status', 'ID', 'Horário', 'Paciente', 'Profissional', 'Tipo']);
    this.styleHeader(ws, ws.rowCount);
    for (const [status, info] of Object.entries(data.porStatus)) {
      for (const ag of info.agendamentos) {
        ws.addRow([
          status,
          ag.id,
          fmtDatetime(ag.dataHoraInicio),
          ag.paciente.nomeCompleto,
          ag.profissional.nomeCompleto,
          ag.tipo,
        ]);
      }
    }
    ws.columns.forEach((col) => {
      col.width = 22;
    });
  }

  private async buildPacientesSheet(
    wb: ExcelJS.Workbook,
    dto: QueryRelatorioDto,
    ctx: CallerCtx,
  ) {
    const data = await this.pacientesCadastrados(dto, ctx);
    const ws = wb.addWorksheet('Pacientes Cadastrados');
    ws.addRow(['Pacientes Cadastrados — Clínica Vida']);
    ws.addRow([
      `Período: ${data.periodo.inicio} a ${data.periodo.fim}`,
      `Total: ${data.total}`,
    ]);
    ws.addRow([]);
    ws.addRow([
      '#',
      'Nome',
      'CPF',
      'Nascimento',
      'Sexo',
      'Telefone',
      'Cadastrado em',
    ]);
    this.styleHeader(ws, 4);
    data.pacientes.forEach((p, i) => {
      ws.addRow([
        i + 1,
        p.nomeCompleto,
        p.cpf,
        fmtDate(p.dataNascimento),
        p.sexo,
        p.telefoneWhatsapp,
        fmtDatetime(p.createdAt),
      ]);
    });
    ws.columns.forEach((col) => {
      col.width = 22;
    });
  }

  private async buildOrigemSheet(
    wb: ExcelJS.Workbook,
    dto: QueryRelatorioDto,
    ctx: CallerCtx,
  ) {
    const data = await this.origemAgendamentos(dto, ctx);
    const ws = wb.addWorksheet('Origem dos Agendamentos');
    ws.addRow(['Origem dos Agendamentos — Clínica Vida']);
    ws.addRow([
      `Período: ${data.periodo.inicio} a ${data.periodo.fim}`,
      `Total: ${data.total}`,
    ]);
    ws.addRow([]);
    ws.addRow(['Origem', 'Quantidade', 'Percentual (%)']);
    this.styleHeader(ws, 4);
    for (const d of data.distribuicao) {
      ws.addRow([d.origem, d.count, d.percentual]);
    }
    ws.columns.forEach((col) => {
      col.width = 22;
    });
  }

  private styleHeader(ws: ExcelJS.Worksheet, rowNumber: number) {
    const row = ws.getRow(rowNumber);
    row.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD6E4F0' },
      };
    });
    row.commit();
  }

  // -------------------------------------------------------------------------
  // PDF builder
  // -------------------------------------------------------------------------

  private async buildPdf(
    tipo: string,
    dto: QueryRelatorioDto & QueryAgendaDiaDto,
    ctx: CallerCtx,
  ): Promise<Buffer> {
    // Fetch all data before touching the stream so async errors propagate normally.
    const content = await this.buildPdfContent(tipo, dto, ctx);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      content(doc);
      doc.end();
    });
  }

  /** Fetches data and returns a synchronous function that writes into the PDFDocument. */
  private async buildPdfContent(
    tipo: string,
    dto: QueryRelatorioDto & QueryAgendaDiaDto,
    ctx: CallerCtx,
  ): Promise<(doc: PDFKit.PDFDocument) => void> {
    // Header writer (shared)
    const writeHeader = (doc: PDFKit.PDFDocument) => {
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Clínica Vida Popular — Sinop/MT', { align: 'center' });
      doc
        .fontSize(12)
        .font('Helvetica')
        .text(this.tipoLabel(tipo), { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .text(`Gerado em: ${fmtDatetime(new Date())}`, { align: 'right' });
      doc.moveDown();
    };

    switch (tipo) {
      case 'agenda-dia': {
        const data = await this.agendaDia(dto, ctx);
        return (doc) => {
          writeHeader(doc);
          doc
            .font('Helvetica-Bold')
            .text(`Data: ${data.data}  |  Total: ${data.total}`);
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(8);
          for (const ag of data.agendamentos) {
            doc.text(
              `${fmtDatetime(ag.dataHoraInicio)} — ${ag.paciente.nomeCompleto} | ${ag.profissional.nomeCompleto} | ${ag.tipo} | ${ag.status}`,
              { lineGap: 2 },
            );
          }
          if (data.agendamentos.length === 0)
            doc.text('Nenhum agendamento no período.');
        };
      }
      case 'agendamentos-status': {
        const data = await this.agendamentosPorStatus(dto, ctx);
        return (doc) => {
          writeHeader(doc);
          doc
            .font('Helvetica-Bold')
            .text(
              `Período: ${data.periodo.inicio} a ${data.periodo.fim}  |  Total: ${data.total}`,
            );
          doc.moveDown(0.5);
          for (const [status, info] of Object.entries(data.porStatus)) {
            doc
              .font('Helvetica-Bold')
              .fontSize(10)
              .text(`${status}: ${info.count}`);
            doc.font('Helvetica').fontSize(8);
            for (const ag of info.agendamentos) {
              doc.text(
                `  ${fmtDatetime(ag.dataHoraInicio)} — ${ag.paciente.nomeCompleto} | ${ag.profissional.nomeCompleto}`,
                { lineGap: 1 },
              );
            }
            doc.moveDown(0.3);
          }
          if (data.total === 0) doc.text('Nenhum agendamento no período.');
        };
      }
      case 'pacientes': {
        const data = await this.pacientesCadastrados(dto, ctx);
        return (doc) => {
          writeHeader(doc);
          doc
            .font('Helvetica-Bold')
            .text(
              `Período: ${data.periodo.inicio} a ${data.periodo.fim}  |  Total: ${data.total}`,
            );
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(8);
          for (const p of data.pacientes) {
            doc.text(
              `${p.nomeCompleto} | CPF: ${p.cpf} | Nasc: ${fmtDate(p.dataNascimento)} | ${p.sexo} | ${p.telefoneWhatsapp} | Cad: ${fmtDatetime(p.createdAt)}`,
              { lineGap: 2 },
            );
          }
          if (data.pacientes.length === 0)
            doc.text('Nenhum paciente cadastrado no período.');
        };
      }
      case 'origem':
      default: {
        const data = await this.origemAgendamentos(dto, ctx);
        return (doc) => {
          writeHeader(doc);
          doc
            .font('Helvetica-Bold')
            .text(
              `Período: ${data.periodo.inicio} a ${data.periodo.fim}  |  Total: ${data.total}`,
            );
          doc.moveDown(0.5);
          doc.font('Helvetica').fontSize(10);
          for (const d of data.distribuicao) {
            doc.text(`${d.origem}: ${d.count} (${d.percentual}%)`, {
              lineGap: 3,
            });
          }
          if (data.total === 0) doc.text('Nenhum agendamento no período.');
        };
      }
    }
  }

  private tipoLabel(tipo: string): string {
    const labels: Record<string, string> = {
      'agenda-dia': 'Agenda do Dia',
      'agendamentos-status': 'Agendamentos por Status',
      pacientes: 'Pacientes Cadastrados no Período',
      origem: 'Origem dos Agendamentos',
    };
    return labels[tipo] ?? tipo;
  }
}
