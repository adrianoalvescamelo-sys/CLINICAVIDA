/**
 * Unit tests — RolesGuard (RBAC matcher)
 *
 * Covers:
 *  - no roles metadata on route → allows all authenticated requests
 *  - user's role matches required roles → allows
 *  - user's role does NOT match → throws ForbiddenException
 *  - no user in request → throws ForbiddenException
 *  - @Public() routes bypass the guard entirely
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilTipo } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildContext(opts: {
  user?: { perfil: PerfilTipo } | null;
  requiredRoles?: PerfilTipo[] | null;
  isPublic?: boolean;
}): ExecutionContext {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === ROLES_KEY) return opts.requiredRoles ?? undefined;
      return undefined;
    }),
  };

  const request = { user: opts.user === undefined ? undefined : opts.user };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    // expose the reflector mock as a side-channel so the guard can use it
    __reflector: reflector,
  } as unknown as ExecutionContext;
}

function makeGuard(ctx: ExecutionContext): RolesGuard {
  // Extract the reflector mock attached to context (test-only trick)
  const reflector = (ctx as any).__reflector as Reflector;
  return new RolesGuard(reflector);
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  it('allows when route has no roles metadata', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.RECEPCAO },
      requiredRoles: null,
    });
    const guard = makeGuard(ctx);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when required roles is an empty array', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.RECEPCAO },
      requiredRoles: [],
    });
    const guard = makeGuard(ctx);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user role matches required role', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.ADMIN },
      requiredRoles: [PerfilTipo.ADMIN],
    });
    const guard = makeGuard(ctx);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user role is one of multiple required roles', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.MEDICO },
      requiredRoles: [PerfilTipo.ADMIN, PerfilTipo.MEDICO],
    });
    const guard = makeGuard(ctx);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user role does not match', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.RECEPCAO },
      requiredRoles: [PerfilTipo.ADMIN, PerfilTipo.MEDICO],
    });
    const guard = makeGuard(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no user in the request', () => {
    const ctx = buildContext({
      user: null,
      requiredRoles: [PerfilTipo.ADMIN],
    });
    const guard = makeGuard(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is undefined', () => {
    const ctx = buildContext({
      // user omitted — request.user will be undefined
      requiredRoles: [PerfilTipo.ADMIN],
    });
    const guard = makeGuard(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows @Public() routes regardless of user or roles', () => {
    const ctx = buildContext({
      isPublic: true,
      user: null,
      requiredRoles: [PerfilTipo.ADMIN],
    });
    const guard = makeGuard(ctx);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('RECEPCAO in MEDICO-only route → 403', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.RECEPCAO },
      requiredRoles: [PerfilTipo.MEDICO],
    });
    const guard = makeGuard(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('PROFISSIONAL_NAO_MEDICO in ADMIN-only route → 403', () => {
    const ctx = buildContext({
      user: { perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO },
      requiredRoles: [PerfilTipo.ADMIN],
    });
    const guard = makeGuard(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
