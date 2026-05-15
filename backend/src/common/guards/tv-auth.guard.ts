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
export class TvAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const sent = req.header('x-tv-token') ?? '';
    const expected = this.config.get<string>('tvSecret') ?? '';

    if (!expected || expected.length < 16) {
      throw new UnauthorizedException({
        code: 'TV_NOT_CONFIGURED',
        message: 'Integração painel TV não configurada',
      });
    }

    if (sent.length !== expected.length) {
      throw new UnauthorizedException({
        code: 'TV_UNAUTHORIZED',
        message: 'Token TV inválido',
      });
    }

    const ok = timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
    if (!ok) {
      throw new UnauthorizedException({
        code: 'TV_UNAUTHORIZED',
        message: 'Token TV inválido',
      });
    }
    return true;
  }
}
