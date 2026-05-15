import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { WhatsappService } from './whatsapp.service';
import { CallbackInboundDto, CallbackStatusDto } from './dto/callback.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BotAuthGuard } from '../common/guards/bot-auth.guard';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller()
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  @Public()
  @UseGuards(BotAuthGuard)
  @Post('bot/whatsapp/status')
  @HttpCode(HttpStatus.OK)
  async callbackStatus(@Body() dto: CallbackStatusDto) {
    if (dto.status === 'ENTREGUE') {
      await this.wa.marcarEntregue(dto.eventId, dto.providerMsgId);
    }
    return { ok: true };
  }

  @Public()
  @UseGuards(BotAuthGuard)
  @Post('bot/whatsapp/inbound')
  @HttpCode(HttpStatus.OK)
  async callbackInbound(@Body() dto: CallbackInboundDto) {
    const inbound = await this.wa.receberResposta({
      eventIdOriginal: dto.eventIdOriginal,
      telefone: dto.telefone,
      texto: dto.texto,
      providerMsgId: dto.providerMsgId,
    });
    return { ok: true, id: inbound.id };
  }

  @Get('whatsapp/pendentes')
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  pendentes() {
    return this.wa.listarPendentes();
  }

  @Post('whatsapp/:id/reenviar')
  @HttpCode(HttpStatus.OK)
  @Roles(PerfilTipo.ADMIN, PerfilTipo.RECEPCAO)
  reenviar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.wa.reenviarManual(
      id,
      user.id,
      (req as any).trace_id ?? 'unknown',
    );
  }
}
