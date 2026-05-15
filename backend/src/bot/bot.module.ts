import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { AgendaModule } from '../agenda/agenda.module';
import { BotAuthGuard } from '../common/guards/bot-auth.guard';

@Module({
  imports: [AgendaModule],
  providers: [BotService, BotAuthGuard],
  controllers: [BotController],
})
export class BotModule {}
