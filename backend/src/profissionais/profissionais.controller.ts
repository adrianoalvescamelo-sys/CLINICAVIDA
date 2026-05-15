import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PerfilTipo } from '@prisma/client';
import { ProfissionaisService } from './profissionais.service';
import { CreateProfissionalDto } from './dto/create-profissional.dto';
import { UpdateProfissionalDto } from './dto/update-profissional.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('profissionais')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO, PerfilTipo.MEDICO)
export class ProfissionaisController {
  constructor(private readonly service: ProfissionaisService) {}

  @Post()
  @Roles(PerfilTipo.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProfissionalDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('ativos', new ParseBoolPipe({ optional: true })) ativos?: boolean,
  ) {
    return this.service.findAll(!!ativos);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(PerfilTipo.ADMIN)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProfissionalDto,
  ) {
    return this.service.update(id, dto);
  }
}
