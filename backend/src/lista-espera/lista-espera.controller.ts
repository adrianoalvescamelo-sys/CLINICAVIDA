import {
  Body,
  Controller,
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
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ListaEsperaService } from './lista-espera.service';
import { CreateListaEsperaDto } from './dto/create-lista-espera.dto';
import { QueryListaEsperaDto } from './dto/query-lista-espera.dto';
import {
  RegistrarRecusaDto,
  UpdateListaEsperaDto,
} from './dto/update-lista-espera.dto';

@Controller('lista-espera')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
export class ListaEsperaController {
  constructor(private readonly listaEspera: ListaEsperaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateListaEsperaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.listaEspera.create(dto, this.ctx(req, user));
  }

  @Get()
  findAll(@Query() query: QueryListaEsperaDto) {
    return this.listaEspera.findAll(query);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateListaEsperaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.listaEspera.update(id, dto, this.ctx(req, user));
  }

  @Post(':id/ofertar-vaga')
  @HttpCode(HttpStatus.CREATED)
  ofertarVaga(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.listaEspera.ofertarVaga(id, this.ctx(req, user));
  }

  @Post(':id/registrar-recusa')
  @HttpCode(HttpStatus.CREATED)
  registrarRecusa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RegistrarRecusaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.listaEspera.registrarRecusa(id, dto, this.ctx(req, user));
  }

  @Post(':id/marcar-agendado')
  @HttpCode(HttpStatus.CREATED)
  marcarAgendado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.listaEspera.marcarAgendado(id, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthUser) {
    return {
      usuarioId: user.id,
      ip: this.ip(req),
      traceId: (req as any).trace_id ?? 'unknown',
    };
  }

  private ip(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
