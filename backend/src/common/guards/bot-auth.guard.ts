import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class BotAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const sent = req.header('x-bot-secret') ?? '';
    const expected = this.config.get<string>('security.botSecret') ?? '';

    if (!expected || expected.length < 16) {
      throw new UnauthorizedException({
        code: 'BOT_NOT_CONFIGURED',
        message: 'Integração bot não configurada',
      });
    }

    if (sent.length !== expected.length) {
      throw new UnauthorizedException({
        code: 'BOT_UNAUTHORIZED',
        message: 'Bot secret inválido',
      });
    }

    const ok = timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
    if (!ok) {
      throw new UnauthorizedException({
        code: 'BOT_UNAUTHORIZED',
        message: 'Bot secret inválido',
      });
    }
    return true;
  }
}
