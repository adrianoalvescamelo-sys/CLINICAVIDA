import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { ConfiguracoesService } from './configuracoes.service';
import { UpdateConfiguracaoDto } from './dto/update-configuracao.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

interface ReqWithTrace extends Request {
  trace_id: string;
}

@Controller('configuracoes')
export class ConfiguracoesController {
  constructor(private readonly service: ConfiguracoesService) {}

  // GET aberto a qualquer autenticado — UI usa pra renderizar agenda/horários
  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  @Roles(PerfilTipo.ADMIN)
  @HttpCode(HttpStatus.OK)
  update(
    @Body() dto: UpdateConfiguracaoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: ReqWithTrace,
  ) {
    return this.service.update(dto, {
      id: user.id,
      ip: req.ip ?? 'unknown',
      traceId: req.trace_id,
    });
  }
}
