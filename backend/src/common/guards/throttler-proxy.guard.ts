import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard que extrai o IP real do header x-forwarded-for.
 * Isso garante que o rate limit funcione corretamente atrás de proxies
 * (NGINX, load balancer) e também nos testes e2e que injetam IPs via
 * x-forwarded-for para isolar o throttler por teste.
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for'] as string | undefined;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? 'unknown';
  }
}
