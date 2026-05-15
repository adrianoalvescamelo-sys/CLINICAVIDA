import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BotService } from './bot.service';
import { PreAgendamentoBotDto } from './dto/pre-agendamento.dto';
import { Public } from '../common/decorators/public.decorator';
import { BotAuthGuard } from '../common/guards/bot-auth.guard';

@Controller('bot')
@Public()
@UseGuards(BotAuthGuard)
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Post('pre-agendamento')
  @HttpCode(HttpStatus.CREATED)
  preAgendamento(@Body() dto: PreAgendamentoBotDto, @Req() req: Request) {
    const ip = this.ip(req);
    const traceId = (req as any).trace_id ?? 'bot-unknown';
    return this.bot.preAgendamento(dto, ip, traceId);
  }

  private ip(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
