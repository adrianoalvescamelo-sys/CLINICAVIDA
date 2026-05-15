import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditResultado } from '@prisma/client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

export interface LoginResult extends TokenPair {
  usuario: {
    id: string;
    email: string;
    nomeCompleto: string;
    perfil: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async generateTokenPair(
    usuario: { id: string; email: string; perfil: string },
    ip?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const expiresIn = this.config.get<string>('jwt.expiresIn')!;
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;

    // access token (signed by JwtModule default secret)
    const access_token = await this.jwt.signAsync(
      { sub: usuario.id, email: usuario.email, perfil: usuario.perfil },
      { expiresIn },
    );

    // refresh token (signed with refresh secret, minimal payload + jti)
    const jti = randomUUID();
    const refresh_token = await this.jwt.signAsync(
      { sub: usuario.id, jti },
      { secret: refreshSecret, expiresIn: refreshExpiresIn },
    );

    // persist SHA-256 hash — never plaintext
    const tokenHash = this.hashToken(refresh_token);
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiresAt,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return { access_token, refresh_token, expires_in: expiresIn };
  }

  // ─── public methods ──────────────────────────────────────────────────────────

  async login(
    email: string,
    senha: string,
    ip: string,
    traceId: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const maxAttempts = this.config.get<number>('auth.maxAttempts')!;
    const lockoutMinutes = this.config.get<number>('auth.lockoutMinutes')!;

    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!usuario) {
      await this.audit.log({
        usuarioId: null,
        acao: 'LOGIN',
        entidade: 'Usuario',
        registroId: null,
        ipDispositivo: ip,
        resultado: AuditResultado.FALHA,
        traceId,
        detalhes: { email, motivo: 'usuario_nao_encontrado' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas',
      });
    }

    if (!usuario.ativo) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'Usuário inativo',
      });
    }

    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      await this.audit.log({
        usuarioId: usuario.id,
        acao: 'LOGIN',
        entidade: 'Usuario',
        registroId: usuario.id,
        ipDispositivo: ip,
        resultado: AuditResultado.NEGADO,
        traceId,
        detalhes: { motivo: 'bloqueado' },
      });
      throw new ForbiddenException({
        code: 'USER_LOCKED',
        message: 'Conta bloqueada temporariamente. Tente novamente mais tarde.',
      });
    }

    const senhaOk = await argon2.verify(usuario.senhaHash, senha);

    if (!senhaOk) {
      const tentativas = usuario.tentativasLogin + 1;
      const data: { tentativasLogin: number; bloqueadoAte?: Date } = {
        tentativasLogin: tentativas,
      };
      if (tentativas >= maxAttempts) {
        data.bloqueadoAte = new Date(Date.now() + lockoutMinutes * 60_000);
        data.tentativasLogin = 0;
      }
      await this.prisma.usuario.update({ where: { id: usuario.id }, data });

      await this.audit.log({
        usuarioId: usuario.id,
        acao: 'LOGIN',
        entidade: 'Usuario',
        registroId: usuario.id,
        ipDispositivo: ip,
        resultado: AuditResultado.FALHA,
        traceId,
        detalhes: {
          motivo: 'senha_incorreta',
          tentativas,
          bloqueado: !!data.bloqueadoAte,
        },
      });

      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas',
      });
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        tentativasLogin: 0,
        bloqueadoAte: null,
        ultimoLoginEm: new Date(),
      },
    });

    const tokenPair = await this.generateTokenPair(usuario, ip, userAgent);

    await this.audit.log({
      usuarioId: usuario.id,
      acao: 'LOGIN',
      entidade: 'Usuario',
      registroId: usuario.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });

    return {
      ...tokenPair,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nomeCompleto: usuario.nomeCompleto,
        perfil: usuario.perfil,
      },
    };
  }

  async refresh(
    refreshTokenRaw: string,
    ip: string,
    traceId: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;

    // 1. Verify JWT signature / expiry
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; jti: string }>(
        refreshTokenRaw,
        { secret: refreshSecret },
      );
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Token de refresh inválido',
      });
    }

    const usuarioId = payload.sub;

    // 2. Lookup stored record by SHA-256 hash
    const tokenHash = this.hashToken(refreshTokenRaw);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Token de refresh inválido',
      });
    }

    // 3. Reuse detection — token was already revoked → chain compromise
    if (stored.revokedAt !== null) {
      // Revoke ALL refresh tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { usuarioId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.log({
        usuarioId,
        acao: 'REFRESH_REUSE_DETECTED',
        entidade: 'auth',
        registroId: usuarioId,
        ipDispositivo: ip,
        resultado: AuditResultado.NEGADO,
        traceId,
        detalhes: { tokenId: stored.id, motivo: 'token_reutilizado' },
      });

      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Token de refresh inválido',
      });
    }

    // 4. Check DB-level expiry (secondary check — JWT exp already checked above)
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'REFRESH_EXPIRED',
        message: 'Token de refresh expirado',
      });
    }

    // 5. Load and validate user
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'Usuário inativo ou não encontrado',
      });
    }

    // 6. Rotate token atomically: revoke old, create new pair, link replacedBy
    const newPair = await this.prisma.$transaction(async (tx) => {
      // Generate new tokens outside tx so we have the new record id after insert
      const expiresIn = this.config.get<string>('jwt.expiresIn')!;
      const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;

      const jti = randomUUID();
      const access_token = await this.jwt.signAsync(
        { sub: usuario.id, email: usuario.email, perfil: usuario.perfil },
        { expiresIn },
      );
      const refresh_token = await this.jwt.signAsync(
        { sub: usuario.id, jti },
        { secret: refreshSecret, expiresIn: refreshExpiresIn },
      );

      const newHash = this.hashToken(refresh_token);
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const newExpiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

      const newRecord = await tx.refreshToken.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });

      // Revoke old token and link to replacement
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: newRecord.id },
      });

      return { access_token, refresh_token, expires_in: expiresIn };
    });

    await this.audit.log({
      usuarioId,
      acao: 'REFRESH_TOKEN_ROTATED',
      entidade: 'auth',
      registroId: usuarioId,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });

    return newPair;
  }

  async logout(
    usuarioId: string,
    ip: string,
    traceId: string,
    refreshTokenRaw?: string,
  ): Promise<void> {
    if (refreshTokenRaw) {
      const tokenHash = this.hashToken(refreshTokenRaw);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      usuarioId,
      acao: 'LOGOUT',
      entidade: 'Usuario',
      registroId: usuarioId,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });
  }
}
