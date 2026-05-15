import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecepcaoController } from './recepcao.controller';
import { RecepcaoService } from './recepcao.service';

@Module({
  imports: [PrismaModule],
  controllers: [RecepcaoController],
  providers: [RecepcaoService],
})
export class RecepcaoModule {}
