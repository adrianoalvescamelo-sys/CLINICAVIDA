import { Controller, Get, Query } from '@nestjs/common';
import { PerfilTipo } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { RecepcaoService } from './recepcao.service';

@Controller('recepcao')
@Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
export class RecepcaoController {
  constructor(private readonly recepcao: RecepcaoService) {}

  @Get('dashboard')
  dashboard(@Query() query: QueryDashboardDto) {
    return this.recepcao.dashboard(query);
  }
}
