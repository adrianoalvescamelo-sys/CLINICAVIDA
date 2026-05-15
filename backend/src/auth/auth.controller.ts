import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    const userAgent = req.headers['user-agent'];
    const result = await this.auth.login(
      dto.email,
      dto.senha,
      ip,
      traceId,
      userAgent,
    );
    return { ...result, token_type: 'Bearer' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    const userAgent = req.headers['user-agent'];
    const pair = await this.auth.refresh(
      dto.refresh_token,
      ip,
      traceId,
      userAgent,
    );
    return { ...pair, token_type: 'Bearer' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: LogoutDto,
    @Req() req: Request,
  ) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    await this.auth.logout(user.id, ip, traceId, dto?.refresh_token);
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private getIp(req: Request): string {
    const fwd = req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
