import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecepcaoController } from './recepcao.controller';
import { RecepcaoService } from './recepcao.service';
import { TvAuthGuard } from '../common/guards/tv-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [RecepcaoController],
  providers: [RecepcaoService, TvAuthGuard],
})
export class RecepcaoModule {}
