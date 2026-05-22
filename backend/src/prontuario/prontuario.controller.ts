import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { ProntuarioService } from './prontuario.service';
import { CriarEvolucaoDto } from './dto/criar-evolucao.dto';
import { RetificarEvolucaoDto } from './dto/retificar-evolucao.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller()
export class ProntuarioController {
  constructor(private readonly prontuario: ProntuarioService) {}

  private ip(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
  private trace(req: Request): string {
    return (req as unknown as { trace_id?: string }).trace_id ?? 'unknown';
  }

  @Get('pacientes/:pacienteId/prontuario')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  listar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.listarProntuario(
      pacienteId,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Get('evolucoes/:id')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.obterEvolucao(
      id,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Post('pacientes/:pacienteId/prontuario/evolucoes')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  criar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @Body() dto: CriarEvolucaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.criarEvolucao(
      pacienteId,
      dto,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Post('evolucoes/:id/retificar')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  retificar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RetificarEvolucaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.prontuario.retificar(
      id,
      dto,
      user,
      this.ip(req),
      this.trace(req),
    );
  }
}
