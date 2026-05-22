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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetSenhaDto } from './dto/reset-senha.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

interface ReqWithTrace extends Request {
  trace_id: string;
}

function actor(req: ReqWithTrace, user: AuthUser) {
  return {
    id: user.id,
    ip: req.ip ?? 'unknown',
    traceId: req.trace_id,
  };
}

@Controller('usuarios')
@Roles(PerfilTipo.ADMIN)
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateUsuarioDto,
    @Req() req: ReqWithTrace,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, actor(req, user));
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUsuarioDto,
    @Req() req: ReqWithTrace,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, actor(req, user));
  }

  @Patch(':id/senha')
  resetSenha(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetSenhaDto,
    @Req() req: ReqWithTrace,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.resetSenha(id, dto, actor(req, user));
  }
}
