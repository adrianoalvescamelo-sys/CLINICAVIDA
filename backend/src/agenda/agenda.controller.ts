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
import { AgendamentoOrigem, PerfilTipo } from '@prisma/client';
import { AgendaService } from './agenda.service';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentosDto } from './dto/query-agendamentos.dto';
import { CreateBloqueioDto } from './dto/bloqueio.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('agendamentos')
@Roles(
  PerfilTipo.ADMIN,
  PerfilTipo.RECEPCAO,
  PerfilTipo.MEDICO,
  PerfilTipo.PROFISSIONAL_NAO_MEDICO,
)
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAgendamentoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.agenda.create(dto, this.ctx(req, user), {
      origem:
        user.perfil === PerfilTipo.ADMIN
          ? AgendamentoOrigem.ADMIN
          : AgendamentoOrigem.RECEPCAO,
    });
  }

  @Get()
  findAll(@Query() q: QueryAgendamentosDto) {
    return this.agenda.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.agenda.findOne(id);
  }

  @Patch(':id')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAgendamentoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.agenda.update(id, dto, this.ctx(req, user));
  }

  @Post(':id/chamar')
  @Roles(
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
    PerfilTipo.ADMIN,
  )
  chamar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.agenda.chamar(id, this.ctx(req, user));
  }

  @Post(':id/atendido')
  @Roles(
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
    PerfilTipo.ADMIN,
  )
  atendido(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.agenda.marcarAtendido(id, this.ctx(req, user));
  }

  @Post(':id/falta')
  @Roles(PerfilTipo.RECEPCAO, PerfilTipo.ADMIN)
  falta(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.agenda.marcarFalta(id, this.ctx(req, user));
  }

  @Post('bloqueios')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  async criarBloqueio(
    @Body() dto: CreateBloqueioDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const profId = await this.profissionalDoUser(user.id);
    return this.agenda.criarBloqueio(dto, this.ctx(req, user), profId);
  }

  @Get('bloqueios')
  listarBloqueios(@Query('profissionalId') profissionalId?: string) {
    return this.agenda.listarBloqueios(profissionalId);
  }

  @Delete('bloqueios/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerBloqueio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const profId = await this.profissionalDoUser(user.id);
    return this.agenda.removerBloqueio(id, this.ctx(req, user), profId);
  }

  private async profissionalDoUser(userId: string) {
    const p = await this.prisma.profissional.findUnique({
      where: { usuarioId: userId },
      select: { id: true },
    });
    return p?.id;
  }

  private ctx(req: Request, user: AuthUser) {
    return {
      usuarioId: user.id,
      perfil: user.perfil as PerfilTipo,
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
