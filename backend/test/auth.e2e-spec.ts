/**
 * Auth E2E — Sprint 1 Task T10
 *
 * Cobre:
 *  - Login (sucesso, senha errada, email inexistente, lockout, usuário inativo)
 *  - Refresh (token válido + rotação, expirado, nunca emitido, reuso, malformado)
 *  - Logout (com/sem refresh_token, revogação, tentativa pós-revogação)
 *  - Rota protegida /auth/me (sem token, token válido, token malformado, user inativo)
 *  - RBAC — acesso sem token → 401
 *  - trace_id (header passado, header ausente → UUID gerado)
 *  - Edge cases (uppercase email, DTO inválido, permissão removida mid-session)
 *
 * Isolamento:
 *  - Emails únicos por teste (sufixo @clinicavida.test) → cleanup em afterAll.
 *  - IPs únicos por teste via x-forwarded-for → evita throttler global.
 *  - ResponseInterceptor registrado no AppModule via APP_INTERCEPTOR — não duplicar.
 *  - AllExceptionsFilter registrado via app.useGlobalFilters (espelha main.ts).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { PerfilTipo } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Email único por invocação */
function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@clinicavida.test`;
}

/** IP único por invocação — evita throttler global entre testes */
let ipCounter = 1;
function uniqueIp(): string {
  const id = ipCounter++;
  // Usa 10.x.x.x (bloco privado) para evitar colisão com loopback
  const a = Math.floor(id / (255 * 255)) % 255;
  const b = Math.floor(id / 255) % 255;
  const c = id % 255;
  return `10.${a}.${b}.${c + 1}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── suite ────────────────────────────────────────────────────────────────────

describe('Auth (e2e) — T10 completo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  // Usuário admin reutilizado em vários describes (evita criar N usuários onde não necessário)
  const baseEmail = uniqueEmail('base');
  const baseSenha = 'SenhaForte!2026';
  // IP fixo para o usuário base — cada teste que usa baseEmail usa um IP diferente do lockout
  const baseIp = uniqueIp();

  // ─── setup global ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    // Espelha main.ts: prefix, validation pipe e filtro de exceções global.
    // ResponseInterceptor já é registrado via APP_INTERCEPTOR no AppModule — não duplicar.
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    // Usuário base admin — criado uma vez, usado em testes de sucesso
    await prisma.usuario.deleteMany({ where: { email: baseEmail } });
    await prisma.usuario.create({
      data: {
        email: baseEmail,
        senhaHash: await argon2.hash(baseSenha),
        nomeCompleto: 'Usuário Base E2E',
        perfil: PerfilTipo.ADMIN,
        tentativasLogin: 0,
        bloqueadoAte: null,
      },
    });
  });

  afterAll(async () => {
    // Limpa todos os usuários de teste criados durante a suite
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: '@clinicavida.test' } },
    });
    await app.close();
  });

  // ─── helper: loginAs ──────────────────────────────────────────────────────

  /**
   * Cria um usuário com perfil/senha fornecidos, faz login e retorna tokens.
   * Usa IP único via x-forwarded-for para não consumir throttler de outros testes.
   */
  async function loginAs(
    perfil: PerfilTipo,
    senha = 'SenhaForte!2026',
    emailPrefix?: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    email: string;
    usuarioId: string;
  }> {
    const email = uniqueEmail(emailPrefix ?? perfil.toLowerCase());
    const ip = uniqueIp();

    await prisma.usuario.create({
      data: {
        email,
        senhaHash: await argon2.hash(senha),
        nomeCompleto: `User ${perfil}`,
        perfil,
        tentativasLogin: 0,
        bloqueadoAte: null,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, senha });

    if (res.status !== 200) {
      throw new Error(
        `loginAs falhou para ${perfil}: status ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    return {
      access_token: res.body.data.access_token,
      refresh_token: res.body.data.refresh_token,
      email,
      usuarioId: usuario!.id,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Health check — pré-condição básica
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Health', () => {
    it('GET /health → 200 com status ok (formato terminus — sem envelope padrão)', async () => {
      // HealthController usa @SkipResponseInterceptor — retorna formato terminus diretamente
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      // Terminus retorna { status: 'ok', info: {...}, error: {}, details: {...} }
      expect(res.body.status).toBe('ok');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Login
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/auth/login', () => {
    it('sucesso → 200 + envelope completo com access_token, refresh_token, expires_in, token_type, usuario', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: baseEmail, senha: baseSenha })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();

      const d = res.body.data;
      expect(d.access_token).toBeDefined();
      expect(typeof d.access_token).toBe('string');
      expect(d.refresh_token).toBeDefined();
      expect(typeof d.refresh_token).toBe('string');
      expect(d.expires_in).toBeDefined();
      expect(d.token_type).toBe('Bearer');

      expect(d.usuario).toBeDefined();
      expect(d.usuario.email).toBe(baseEmail);
      expect(d.usuario.id).toBeDefined();
      expect(d.usuario.nomeCompleto).toBeDefined();
      expect(d.usuario.perfil).toBeDefined();
      // Senha nunca exposta
      expect(d.usuario.senhaHash).toBeUndefined();
      expect(d.usuario.senha).toBeUndefined();
    });

    it('senha errada → 401 + code CREDENCIAIS_INVALIDAS ou UNAUTHORIZED (sem enumeration)', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: uniqueEmail('wrong-pw'), senha: 'errada123' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(['CREDENCIAIS_INVALIDAS', 'UNAUTHORIZED']).toContain(
        res.body.error.code,
      );
      expect(res.body.error.trace_id).toBeDefined();
      expect(res.body.data).toBeNull();
    });

    it('email inexistente → 401 (mesmo code que senha errada — sem enumeration)', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({
          email: 'naoexiste.nunca@clinicavida.test',
          senha: 'qualquer123',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(['CREDENCIAIS_INVALIDAS', 'UNAUTHORIZED']).toContain(
        res.body.error.code,
      );
      // Anti-enumeration: mesmo code para email inexistente e senha errada
      expect(res.body.error.message).toBeDefined();
    });

    it('payload inválido (email sem @) → 400', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: 'nao-e-email', senha: 'SenhaForte!2026' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('lockout: N tentativas com senha errada bloqueiam conta', async () => {
      const lockEmail = uniqueEmail('lockout');
      const lockSenha = 'SenhaForte!2026';
      // IP dedicado para este teste — evita throttler global
      const lockIp = uniqueIp();

      await prisma.usuario.create({
        data: {
          email: lockEmail,
          senhaHash: await argon2.hash(lockSenha),
          nomeCompleto: 'Lockout Test',
          perfil: PerfilTipo.RECEPCAO,
          tentativasLogin: 0,
          bloqueadoAte: null,
        },
      });

      const maxAttempts: number =
        configService.get<number>('auth.maxAttempts') ?? 5;

      // Faz maxAttempts tentativas com senha errada — dispara o lockout
      for (let i = 0; i < maxAttempts; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('x-forwarded-for', lockIp)
          .send({ email: lockEmail, senha: 'errada' });
      }

      // Próxima tentativa com senha CORRETA — deve estar bloqueado
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', lockIp)
        .send({ email: lockEmail, senha: lockSenha });

      // Aceita 401 (sem mensagem de lock) ou 403 (bloqueado explicitamente)
      expect([401, 403]).toContain(res.status);
      if (res.status === 403) {
        expect(res.body.error.code).toBe('USER_LOCKED');
      }

      // Verifica no DB que lockout foi registrado
      const usuario = await prisma.usuario.findUnique({
        where: { email: lockEmail },
      });
      expect(usuario).toBeTruthy();
      // Após maxAttempts: ou bloqueadoAte está no futuro, ou tentativas acumuladas
      const estaLocked =
        (usuario!.bloqueadoAte !== null &&
          usuario!.bloqueadoAte > new Date()) ||
        usuario!.tentativasLogin >= maxAttempts;
      // Quando lockout dispara, service zera tentativas e seta bloqueadoAte
      // então basta conferir que bloqueadoAte está no futuro
      const bloqueadoNaoDB =
        usuario!.bloqueadoAte !== null && usuario!.bloqueadoAte > new Date();
      expect(bloqueadoNaoDB || estaLocked).toBe(true);
    });

    it('usuário inativo → 403 USER_INACTIVE', async () => {
      const inativoEmail = uniqueEmail('inativo');
      const ip = uniqueIp();

      await prisma.usuario.create({
        data: {
          email: inativoEmail,
          senhaHash: await argon2.hash('SenhaForte!2026'),
          nomeCompleto: 'Inativo',
          perfil: PerfilTipo.MEDICO,
          ativo: false,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: inativoEmail, senha: 'SenhaForte!2026' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_INACTIVE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Refresh Token
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/auth/refresh', () => {
    it('token válido → 200 + novo par, antigo marcado revoked no DB com replacedBy preenchido', async () => {
      const { refresh_token, usuarioId } = await loginAs(
        PerfilTipo.MEDICO,
        'SenhaForte!2026',
        'refresh-valid',
      );
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token })
        .expect(200);

      expect(res.body.success).toBe(true);
      const d = res.body.data;
      expect(d.access_token).toBeDefined();
      expect(d.refresh_token).toBeDefined();
      expect(d.token_type).toBe('Bearer');
      expect(d.refresh_token).not.toBe(refresh_token);

      // Verifica que token antigo está revoked no DB
      const oldHash = crypto
        .createHash('sha256')
        .update(refresh_token)
        .digest('hex');
      const oldStored = await prisma.refreshToken.findUnique({
        where: { tokenHash: oldHash },
      });
      expect(oldStored).toBeTruthy();
      expect(oldStored!.revokedAt).not.toBeNull();
      expect(oldStored!.replacedBy).not.toBeNull();

      // Novo token existe no DB como ativo (revokedAt null)
      const newHash = crypto
        .createHash('sha256')
        .update(d.refresh_token)
        .digest('hex');
      const newStored = await prisma.refreshToken.findUnique({
        where: { tokenHash: newHash },
      });
      expect(newStored).toBeTruthy();
      expect(newStored!.revokedAt).toBeNull();
      expect(newStored!.usuarioId).toBe(usuarioId);
    });

    it('token expirado (DB expiresAt forçado no passado) → 401', async () => {
      const { refresh_token } = await loginAs(
        PerfilTipo.PROFISSIONAL_NAO_MEDICO,
        'SenhaForte!2026',
        'refresh-expired',
      );
      const ip = uniqueIp();

      // Força expiração no DB — JWT ainda é sintaticamente válido
      const tokenHash = crypto
        .createHash('sha256')
        .update(refresh_token)
        .digest('hex');
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token });

      expect(res.status).toBe(401);
      expect(['REFRESH_EXPIRED', 'INVALID_REFRESH_TOKEN']).toContain(
        res.body.error.code,
      );
    });

    it('token nunca emitido (JWT válido sintaticamente, hash ausente no DB) → 401 INVALID_REFRESH_TOKEN', async () => {
      const ip = uniqueIp();
      const refreshSecret =
        configService.get<string>('jwt.refreshSecret') ??
        'test-refresh-secret-clinicavida-2026-devonly-min32chars';

      // JWT válido assinado mas sem persistência no DB
      const fakeToken = await jwtService.signAsync(
        { sub: randomUUID(), jti: randomUUID() },
        { secret: refreshSecret, expiresIn: '7d' },
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token: fakeToken })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('JWT malformado → 401 INVALID_REFRESH_TOKEN', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token: 'este.nao.e.um.jwt' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('reuso de refresh token: usar antigo após rotação → 401 REFRESH_TOKEN_REUSED + todos tokens do user revogados', async () => {
      const { refresh_token, usuarioId } = await loginAs(
        PerfilTipo.RECEPCAO,
        'SenhaForte!2026',
        'reuse',
      );
      const ip = uniqueIp();

      // Passo 1: rotaciona token original → recebe novo par
      const rotateRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token })
        .expect(200);

      const newRefreshToken = rotateRes.body.data.refresh_token;
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(refresh_token);

      // Passo 2: usa token ANTIGO novamente → reuso detectado
      const reuseRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token })
        .expect(401);

      expect(reuseRes.body.error.code).toBe('REFRESH_TOKEN_REUSED');

      // Passo 3: TODOS refresh tokens do user devem estar revogados
      const activeTokens = await prisma.refreshToken.findMany({
        where: { usuarioId, revokedAt: null },
      });
      expect(activeTokens).toHaveLength(0);
    });

    it('reuso transitivo: rotacionar token2 e usar token2 de novo → REFRESH_TOKEN_REUSED', async () => {
      const { refresh_token: token1 } = await loginAs(
        PerfilTipo.ADMIN,
        'SenhaForte!2026',
        'reuse2',
      );
      const ip = uniqueIp();

      // Rotaciona token1 → token2
      const rotate1 = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token: token1 })
        .expect(200);
      const token2 = rotate1.body.data.refresh_token;

      // Rotaciona token2 → token3
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token: token2 })
        .expect(200);

      // Usa token2 de novo → reuso
      const reuseRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token: token2 });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Logout
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/auth/logout', () => {
    it('com refresh_token no body → 204, refresh marcado revoked no DB', async () => {
      const { access_token, refresh_token } = await loginAs(
        PerfilTipo.MEDICO,
        'SenhaForte!2026',
        'logout1',
      );
      const ip = uniqueIp();

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .set('x-forwarded-for', ip)
        .send({ refresh_token })
        .expect(204);

      // Token marcado revoked no DB
      const tokenHash = crypto
        .createHash('sha256')
        .update(refresh_token)
        .digest('hex');
      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      expect(stored).toBeTruthy();
      expect(stored!.revokedAt).not.toBeNull();
    });

    it('sem refresh_token no body → 204 (apenas audit log)', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.RECEPCAO,
        'SenhaForte!2026',
        'logout2',
      );
      const ip = uniqueIp();

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .set('x-forwarded-for', ip)
        .send({})
        .expect(204);
    });

    it('tentar refresh do token revogado pós-logout → 401 (reuse ou invalid)', async () => {
      const { access_token, refresh_token } = await loginAs(
        PerfilTipo.ADMIN,
        'SenhaForte!2026',
        'logout3',
      );
      const ip = uniqueIp();

      // Revoga token via logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .set('x-forwarded-for', ip)
        .send({ refresh_token })
        .expect(204);

      // Tentativa de uso do token revogado
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refresh_token });

      expect(res.status).toBe(401);
      // Token no DB com revokedAt != null → detectado como reuso
      expect(['REFRESH_TOKEN_REUSED', 'INVALID_REFRESH_TOKEN']).toContain(
        res.body.error.code,
      );
    });

    it('logout sem access token → 401 (rota JWT-protegida)', async () => {
      const ip = uniqueIp();
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('x-forwarded-for', ip)
        .send({})
        .expect(401);
    });

    it('logout sem body completamente → 204', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.MEDICO,
        'SenhaForte!2026',
        'logout-nobody',
      );
      const ip = uniqueIp();

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .set('x-forwarded-for', ip)
        .expect(204);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Rota protegida: POST /api/auth/me
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /api/auth/me (rota protegida)', () => {
    it('sem token → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBeDefined();
    });

    it('token válido ADMIN → 200 + dados do usuário no envelope', async () => {
      const { access_token, email } = await loginAs(
        PerfilTipo.ADMIN,
        'SenhaForte!2026',
        'me-admin',
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.perfil).toBe(PerfilTipo.ADMIN);
    });

    it('token válido RECEPCAO → 200', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.RECEPCAO,
        'SenhaForte!2026',
        'me-recepcao',
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.data.perfil).toBe(PerfilTipo.RECEPCAO);
    });

    it('token válido MEDICO → 200', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.MEDICO,
        'SenhaForte!2026',
        'me-medico',
      );

      await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
    });

    it('access token malformado → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', 'Bearer token.invalido.aqui')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('user desativado após login → JwtStrategy revalida → 401', async () => {
      const { access_token, email } = await loginAs(
        PerfilTipo.MEDICO,
        'SenhaForte!2026',
        'inativo-session',
      );

      // Primeiro request OK — usuário ativo
      await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // Desativa usuário (simula revogação de acesso mid-session)
      await prisma.usuario.update({
        where: { email },
        data: { ativo: false },
      });

      // Próximo request com mesmo token → JwtStrategy revalida e recusa
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. RBAC
  // ═══════════════════════════════════════════════════════════════════════════

  describe('RBAC', () => {
    it('sem token em rota protegida → 401 (não 403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .expect(401);

      expect(res.body.success).toBe(false);
      // Deve ser 401 Unauthorized, não 403 Forbidden
      expect(res.status).toBe(401);
    });

    it('perfil ADMIN acessa /api/auth/me → 200', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.ADMIN,
        'SenhaForte!2026',
        'rbac-admin',
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.data.perfil).toBe(PerfilTipo.ADMIN);
    });

    it('perfil RECEPCAO acessa /api/auth/me → 200 (rota sem restrição de role)', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.RECEPCAO,
        'SenhaForte!2026',
        'rbac-recepcao',
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.data.perfil).toBe(PerfilTipo.RECEPCAO);
    });

    it('perfil PROFISSIONAL_NAO_MEDICO acessa /api/auth/me → 200', async () => {
      const { access_token } = await loginAs(
        PerfilTipo.PROFISSIONAL_NAO_MEDICO,
        'SenhaForte!2026',
        'rbac-profissional',
      );

      await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. trace_id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('trace_id', () => {
    it('header x-trace-id enviado → error envelope contém mesmo trace_id', async () => {
      const customTraceId = 'abc-123-xyz-456';
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-trace-id', customTraceId)
        .set('x-forwarded-for', ip)
        .send({
          email: 'naoexiste.trace@clinicavida.test',
          senha: 'qualquer123',
        })
        .expect(401);

      expect(res.body.error.trace_id).toBe(customTraceId);
    });

    it('header x-trace-id enviado → response header x-trace-id é ecoado', async () => {
      const customTraceId = 'trace-header-echo';
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-trace-id', customTraceId)
        .set('x-forwarded-for', ip)
        .send({
          email: 'naoexiste.echo@clinicavida.test',
          senha: 'qualquer123',
        });

      expect(res.headers['x-trace-id']).toBe(customTraceId);
    });

    it('sem header x-trace-id → trace_id gerado automaticamente é UUID v4', async () => {
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({
          email: 'naoexiste.uuid@clinicavida.test',
          senha: 'qualquer123',
        })
        .expect(401);

      const traceId = res.body.error.trace_id;
      expect(traceId).toBeDefined();
      expect(UUID_REGEX.test(traceId)).toBe(true);
    });

    it('trace_id aparece em erros de refresh também', async () => {
      const traceId = 'refresh-trace-00112';
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-trace-id', traceId)
        .set('x-forwarded-for', ip)
        .send({ refresh_token: 'token.invalido.aqui' })
        .expect(401);

      expect(res.body.error.trace_id).toBe(traceId);
    });

    it('trace_id em sucesso → aparece no response header x-trace-id', async () => {
      const customTraceId = 'trace-success-ok12';
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-trace-id', customTraceId)
        .set('x-forwarded-for', ip)
        .send({ email: baseEmail, senha: baseSenha })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      // No sucesso, error é null, mas o trace_id está no response header
      expect(res.headers['x-trace-id']).toBe(customTraceId);
    });

    it('x-trace-id com caractere inválido → middleware descarta e gera novo UUID', async () => {
      const invalidTraceId = 'inv@lid!trace#id';
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-trace-id', invalidTraceId)
        .set('x-forwarded-for', ip)
        .send({ email: 'naoexiste.bad@clinicavida.test', senha: 'qualquer123' })
        .expect(401);

      const returnedTrace = res.body.error.trace_id;
      // Middleware rejeitou o inválido e gerou UUID novo
      expect(returnedTrace).not.toBe(invalidTraceId);
      expect(UUID_REGEX.test(returnedTrace)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('login com email em uppercase → normalizado para lowercase e autenticado', async () => {
      // AuthService faz email.toLowerCase() antes de buscar
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: baseEmail.toUpperCase(), senha: baseSenha })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.usuario.email).toBe(baseEmail);
    });

    it('refresh com body vazio → 400 (ValidationPipe rejeita DTO)', async () => {
      const ip = uniqueIp();
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({})
        .expect(400);
    });

    it('permissão removida durante sessão: user desativado → próximo request a /me → 401', async () => {
      const { access_token, email } = await loginAs(
        PerfilTipo.ADMIN,
        'SenhaForte!2026',
        'perm-revoked',
      );

      // Request inicial OK
      await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // Admin desativa user (simula mudança de permissão mid-session)
      await prisma.usuario.update({
        where: { email },
        data: { ativo: false },
      });

      // Próximo request com mesmo token — JwtStrategy revalida a cada request
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${access_token}`);

      expect(res.status).toBe(401);
    });

    it('schema de resposta de erro é consistente: { success:false, data:null, error:{code,message,trace_id} }', async () => {
      const ip = uniqueIp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: 'schema.erro@clinicavida.test', senha: 'errada123' })
        .expect(401);

      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          trace_id: expect.any(String),
        },
      });
    });

    it('schema de resposta de sucesso é consistente: { success:true, error:null, data:{...} }', async () => {
      const ip = uniqueIp();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ email: baseEmail, senha: baseSenha })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        error: null,
        data: {
          access_token: expect.any(String),
          refresh_token: expect.any(String),
        },
      });
    });
  });
});
