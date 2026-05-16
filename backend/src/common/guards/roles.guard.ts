import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilTipo, AuditResultado } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PerfilTipo[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const { user } = req;

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Usuário sem perfil válido',
      });
    }

    if (!required.includes(user.perfil)) {
      const traceId: string = req.trace_id ?? 'unknown';
      const ip: string =
        (req.headers?.['x-forwarded-for'] as string | undefined)
          ?.split(',')[0]
          ?.trim() ??
        req.ip ??
        'unknown';

      this.audit
        .log({
          usuarioId: user.id ?? null,
          acao: 'ACCESS_DENIED',
          entidade: context.getClass().name,
          registroId: null,
          ipDispositivo: ip,
          resultado: AuditResultado.NEGADO,
          traceId,
          detalhes: {
            perfil: user.perfil,
            requerido: required,
            rota: req.url,
          },
        })
        .catch(() => {
          // audit failure must never block the guard response
        });

      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Perfil sem permissão para esta operação',
      });
    }

    return true;
  }
}
