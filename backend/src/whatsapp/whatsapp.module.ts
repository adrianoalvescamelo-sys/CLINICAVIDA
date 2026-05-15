import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappCron } from './whatsapp.cron';
import { BotAuthGuard } from '../common/guards/bot-auth.guard';

@Module({
  imports: [HttpModule],
  providers: [WhatsappService, WhatsappCron, BotAuthGuard],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
