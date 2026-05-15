import { Module } from '@nestjs/common';
import { ProfissionaisService } from './profissionais.service';
import { ProfissionaisController } from './profissionais.controller';

@Module({
  providers: [ProfissionaisService],
  controllers: [ProfissionaisController],
  exports: [ProfissionaisService],
})
export class ProfissionaisModule {}
