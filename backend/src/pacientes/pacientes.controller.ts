import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { PacientesService } from './pacientes.service';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import { QueryPacientesDto } from './dto/query-pacientes.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('pacientes')
@Roles(
  PerfilTipo.ADMIN,
  PerfilTipo.RECEPCAO,
  PerfilTipo.MEDICO,
  PerfilTipo.PROFISSIONAL_NAO_MEDICO,
)
export class PacientesController {
  constructor(private readonly pacientes: PacientesService) {}

  @Post()
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreatePacienteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.pacientes.create(dto, user.id, this.ip(req), this.trace(req));
  }

  @Get()
  findAll(@Query() query: QueryPacientesDto) {
    return this.pacientes.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pacientes.findOne(id, user.perfil as PerfilTipo);
  }

  @Get(':id/historico')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO, PerfilTipo.MEDICO)
  historico(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pacientes.historico(id);
  }

  @Patch(':id')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePacienteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.pacientes.update(
      id,
      dto,
      user.id,
      this.ip(req),
      this.trace(req),
    );
  }

  @Delete(':id')
  @Roles(PerfilTipo.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.pacientes.softDelete(
      id,
      user.id,
      this.ip(req),
      this.trace(req),
    );
  }

  private ip(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  private trace(req: Request): string {
    return (req as any).trace_id ?? 'unknown';
  }
}
