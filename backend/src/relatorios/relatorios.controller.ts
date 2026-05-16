import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuditResultado, PerfilTipo } from '@prisma/client';
import { RelatoriosService, CallerCtx } from './relatorios.service';
import { QueryRelatorioDto } from './dto/query-relatorio.dto';
import { QueryAgendaDiaDto } from './dto/query-agenda-dia.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkipResponseInterceptor } from '../common/decorators/skip-response-interceptor.decorator';

/** Perfis que exigem vínculo com um registro de Profissional. */
const PERFIS_PROFISSIONAL = new Set<PerfilTipo>([
  PerfilTipo.MEDICO,
  PerfilTipo.PROFISSIONAL_NAO_MEDICO,
]);

@Controller('relatorios')
@Roles(
  PerfilTipo.ADMIN,
  PerfilTipo.RECEPCAO,
  PerfilTipo.MEDICO,
  PerfilTipo.PROFISSIONAL_NAO_MEDICO,
)
export class RelatoriosController {
  constructor(
    private readonly relatorios: RelatoriosService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Agenda do dia
  // ---------------------------------------------------------------------------
  @Get('agenda-dia')
  @HttpCode(HttpStatus.OK)
  async agendaDia(
    @Query() dto: QueryAgendaDiaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ctx = await this.ctx(req, user);
    const data = await this.relatorios.agendaDia(dto, ctx);
    await this.auditAcesso('agenda-dia', ctx, { data: dto.data });
    return data;
  }

  // ---------------------------------------------------------------------------
  // 2. Agendamentos por status
  // ---------------------------------------------------------------------------
  @Get('agendamentos-status')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.RECEPCAO,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  @HttpCode(HttpStatus.OK)
  async agendamentosPorStatus(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ctx = await this.ctx(req, user);
    const data = await this.relatorios.agendamentosPorStatus(dto, ctx);
    await this.auditAcesso('agendamentos-status', ctx, {
      inicio: dto.inicio,
      fim: dto.fim,
    });
    return data;
  }

  // ---------------------------------------------------------------------------
  // 3. Pacientes cadastrados no período
  // ---------------------------------------------------------------------------
  @Get('pacientes-periodo')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  @HttpCode(HttpStatus.OK)
  async pacientesPeriodo(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ctx = await this.ctx(req, user);
    const data = await this.relatorios.pacientesCadastrados(dto, ctx);
    await this.auditAcesso('pacientes-periodo', ctx, {
      inicio: dto.inicio,
      fim: dto.fim,
    });
    return data;
  }

  // ---------------------------------------------------------------------------
  // 4. Origem dos agendamentos
  // ---------------------------------------------------------------------------
  @Get('origem')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.RECEPCAO,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  @HttpCode(HttpStatus.OK)
  async origemAgendamentos(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ctx = await this.ctx(req, user);
    const data = await this.relatorios.origemAgendamentos(dto, ctx);
    await this.auditAcesso('origem', ctx, {
      inicio: dto.inicio,
      fim: dto.fim,
    });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Exports — Excel
  // ---------------------------------------------------------------------------

  @Get('export/agenda-dia/xlsx')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportAgendaDiaXlsx(
    @Query() dto: QueryAgendaDiaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportExcel('agenda-dia', dto, ctx);
      await this.auditExport('agenda-dia', 'xlsx', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('agenda-dia', 'xlsx', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  @Get('export/agendamentos-status/xlsx')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportStatusXlsx(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportExcel(
        'agendamentos-status',
        dto,
        ctx,
      );
      await this.auditExport(
        'agendamentos-status',
        'xlsx',
        ctx,
        AuditResultado.SUCESSO,
      );
      return file;
    } catch (err) {
      await this.auditExport(
        'agendamentos-status',
        'xlsx',
        ctx,
        AuditResultado.FALHA,
      );
      throw err;
    }
  }

  @Get('export/pacientes/xlsx')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportPacientesXlsx(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportExcel('pacientes', dto, ctx);
      await this.auditExport('pacientes', 'xlsx', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('pacientes', 'xlsx', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  @Get('export/origem/xlsx')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportOrigemXlsx(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportExcel('origem', dto, ctx);
      await this.auditExport('origem', 'xlsx', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('origem', 'xlsx', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Exports — PDF
  // ---------------------------------------------------------------------------

  @Get('export/agenda-dia/pdf')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportAgendaDiaPdf(
    @Query() dto: QueryAgendaDiaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportPdf('agenda-dia', dto, ctx);
      await this.auditExport('agenda-dia', 'pdf', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('agenda-dia', 'pdf', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  @Get('export/agendamentos-status/pdf')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportStatusPdf(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportPdf(
        'agendamentos-status',
        dto,
        ctx,
      );
      await this.auditExport(
        'agendamentos-status',
        'pdf',
        ctx,
        AuditResultado.SUCESSO,
      );
      return file;
    } catch (err) {
      await this.auditExport(
        'agendamentos-status',
        'pdf',
        ctx,
        AuditResultado.FALHA,
      );
      throw err;
    }
  }

  @Get('export/pacientes/pdf')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportPacientesPdf(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportPdf('pacientes', dto, ctx);
      await this.auditExport('pacientes', 'pdf', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('pacientes', 'pdf', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  @Get('export/origem/pdf')
  @Roles(PerfilTipo.ADMIN)
  @SkipResponseInterceptor()
  async exportOrigemPdf(
    @Query() dto: QueryRelatorioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const ctx = await this.ctx(req, user);
    try {
      const file = await this.relatorios.exportPdf('origem', dto, ctx);
      await this.auditExport('origem', 'pdf', ctx, AuditResultado.SUCESSO);
      return file;
    } catch (err) {
      await this.auditExport('origem', 'pdf', ctx, AuditResultado.FALHA);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds CallerCtx, resolving profissionalId for MEDICO / PROFISSIONAL_NAO_MEDICO.
   * Throws 403 PROFISSIONAL_NAO_VINCULADO if the user has no linked Profissional record.
   */
  private async ctx(req: Request, user: AuthUser): Promise<CallerCtx> {
    const perfil = user.perfil as PerfilTipo;
    let profissionalId: string | undefined;

    if (PERFIS_PROFISSIONAL.has(perfil)) {
      const prof = await this.prisma.profissional.findFirst({
        where: { usuarioId: user.id },
        select: { id: true },
      });
      if (!prof) {
        throw new ForbiddenException({
          code: 'PROFISSIONAL_NAO_VINCULADO',
          message: 'Usuário não está vinculado a nenhum profissional.',
        });
      }
      profissionalId = prof.id;
    }

    return {
      usuarioId: user.id,
      perfil,
      ip: this.ip(req),
      traceId: (req as any).trace_id ?? 'unknown',
      profissionalId,
    };
  }

  private ip(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  private async auditExport(
    relatorio: string,
    formato: string,
    ctx: CallerCtx,
    resultado: AuditResultado,
  ) {
    await this.audit.log({
      usuarioId: ctx.usuarioId,
      acao: 'EXPORT',
      entidade: 'Relatorio',
      registroId: null,
      ipDispositivo: ctx.ip,
      resultado,
      traceId: ctx.traceId,
      detalhes: { relatorio, formato },
    });
  }

  private async auditAcesso(
    relatorio: string,
    ctx: CallerCtx,
    filtros: Record<string, unknown>,
  ) {
    await this.audit.log({
      usuarioId: ctx.usuarioId,
      acao: 'ACESSO_RELATORIO',
      entidade: 'Relatorio',
      registroId: null,
      ipDispositivo: ctx.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: ctx.traceId,
      detalhes: { relatorio, ...filtros },
    });
  }
}
