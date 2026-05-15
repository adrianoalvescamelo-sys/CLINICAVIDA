import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuditResultado, PerfilTipo } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators/public.decorator';
import { TvAuthGuard } from '../common/guards/tv-auth.guard';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryPainelTvDto } from './dto/query-painel-tv.dto';
import { RecepcaoService } from './recepcao.service';

@Controller('recepcao')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
export class RecepcaoController {
  constructor(
    private readonly recepcao: RecepcaoService,
    private readonly audit: AuditService,
  ) {}

  @Get('painel-tv')
  @Public()
  @UseGuards(TvAuthGuard)
  painelTV(@Query() query: QueryPainelTvDto) {
    return this.recepcao.painelTV(query.data);
  }

  @Get('dashboard')
  async dashboard(
    @Query() query: QueryDashboardDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const data = await this.recepcao.dashboard(query);
    await this.audit.log({
      usuarioId: user.id,
      acao: 'ACESSO_DASHBOARD',
      entidade: 'Dashboard',
      registroId: null,
      ipDispositivo: this.ip(req),
      resultado: AuditResultado.SUCESSO,
      traceId: (req as any).trace_id ?? 'unknown',
      detalhes: {
        data: query.data,
        profissionalId: query.profissionalId ?? null,
      },
    });
    return data;
  }

  private ip(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
