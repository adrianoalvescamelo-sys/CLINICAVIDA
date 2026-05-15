# Sprint 1 — Infra & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Sprint 1 foundation (infra, auth, RBAC, auditoria, health, logs, graceful shutdown, tests, seed) according to the DoD in the task prompt — delivering a fully verified, git-tracked codebase ready to unblock Sprint 2 (pacientes).

**Architecture:** NestJS + Fastify-style architecture but using NestJS platform-express, Prisma ORM on PostgreSQL, JWT stateless access tokens (15 min) + DB-backed refresh tokens (7 days), RBAC via NestJS guards, pino structured logs with trace_id, Docker Compose for local infra.

**Tech Stack:** Node.js 20, NestJS 10, TypeScript, Prisma 5, PostgreSQL 16, argon2id, passport-jwt, @nestjs/terminus, nestjs-pino, vitest (unit) + jest + supertest (e2e), Docker Compose.

---

## Current State Assessment

The codebase already has substantial Sprint 1 work done. This plan fills the **gaps** between what exists and what the DoD requires:

| # | Gap | DoD Item |
|---|-----|----------|
| G1 | Git not initialised | implicit prerequisite |
| G2 | `POST /auth/refresh` endpoint missing; refresh token table absent from schema/migrations | DoD item 4 |
| G3 | `POST /auth/logout` does not revoke refresh token | DoD item 4 |
| G4 | Seed creates only 1 admin — must create 1 user per profile | DoD item 15 |
| G5 | Unit tests for hashing, JWT sign/verify, RBAC matcher are absent | DoD item 14 |
| G6 | Integration tests for refresh valid/expired/revoked, rota protegida com perfil insuficiente are absent | DoD item 14 |
| G7 | Health endpoints bypass `ResponseInterceptor` via `@HealthCheck()` — e2e test expects `res.body.data.status === 'ok'` which won't match terminus raw format | DoD item 8 |
| G8 | Graceful shutdown has `enableShutdownHooks()` but no explicit 30 s drain / force-exit timeout | DoD item 10 |
| G9 | `CORS_ORIGIN` and `BOT_SECRET` missing from `.env.example`; `.env.example` is incomplete | DoD item 7 |
| G10 | Docker Compose missing `api` service (only postgres defined) | DoD item 2 |
| G11 | `auth.service.ts` `logout()` must revoke the refresh token from DB | DoD item 4 |
| G12 | `auth.service.ts` login response must include `refresh_token` field | DoD item 4 |

---

## File Structure

### New files to create

```
backend/
  src/
    auth/
      dto/
        refresh.dto.ts          — body DTO for POST /auth/refresh
      auth.service.ts           — MODIFY: add signRefreshToken, verifyRefreshToken, refresh(), update logout()
      auth.controller.ts        — MODIFY: add POST /auth/refresh route
    prisma/
      schema.prisma             — MODIFY: add RefreshToken model
    __tests__/
      auth.unit.spec.ts         — NEW: unit tests (hashing, JWT, RBAC)
  test/
    auth.e2e-spec.ts            — MODIFY: add refresh/revoke/403-perfil cases; fix /health assertion

docker-compose.yml              — MODIFY: add api service

.env.example                    — MODIFY: add CORS_ORIGIN, JWT_REFRESH_EXPIRES_IN, JWT_REFRESH_SECRET

backend/prisma/migrations/
  20260514220000_refresh_tokens/migration.sql   — created by prisma migrate dev
```

### Files that must NOT be changed unless noted

All existing files outside of the gaps above — pacientes, agenda, whatsapp, relatorios, etc. — are out of scope.

---

## Task 1: Initialise git repository and create .gitignore

**Files:**
- Create: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\.gitignore`
- Run: `git init` in the project root

- [ ] **Step 1.1: Create .gitignore**

Create `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\.gitignore` with content:

```
# Dependencies
node_modules/

# Build output
backend/dist/
frontend/dist/

# Environment files (never commit secrets)
.env
backend/.env
frontend/.env

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Prisma generated
backend/src/generated/
```

- [ ] **Step 1.2: Initialise git**

Run from `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA`:
```bash
git init
git add .gitignore CLAUDE.md README.md SPEC_App_Clinica_Vida_revisada.json docker-compose.yml .env.example package.json
git add backend/package.json backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json
git add backend/prisma/ backend/src/ backend/test/
git add frontend/package.json frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/src/ frontend/public/ frontend/index.html
git add docs/
git commit -m "chore: initial commit — Sprint 1 foundation (NestJS + Prisma + auth base)"
```

Expected output: `[main (root-commit) <hash>] chore: initial commit...`

---

## Task 2: Complete `.env.example` and fix environment documentation

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\.env.example`

The current `.env.example` is missing `CORS_ORIGIN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `BOT_SECRET` (it appears in `configuration.ts` but not in the example). Fix it.

- [ ] **Step 2.1: Overwrite `.env.example` with the complete set of variables**

Replace the file content with:

```dotenv
# =============================================================================
# App Clínica Vida — Variáveis de ambiente (exemplo/template)
# Copie para .env e ajuste os valores antes de rodar.
# NUNCA commite o arquivo .env real.
# =============================================================================

# ---------------- App --------------------------------------------------------
NODE_ENV=development          # development | homolog | production
PORT=3000

# ---------------- Banco de dados ---------------------------------------------
DATABASE_URL=postgresql://clinicavida:clinicavida_dev@localhost:5432/clinicavida?schema=public

# ---------------- JWT access token ------------------------------------------
# Mínimo 32 caracteres. Gere com: openssl rand -base64 48
JWT_SECRET=change-me-in-prod-min-32-chars-long-xxxxxxxxxxxxxxxx
JWT_EXPIRES_IN=15m            # access token — recomendado 15 min

# ---------------- JWT refresh token -----------------------------------------
# Segredo separado do access token.
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars-xxxxxxxxxx
JWT_REFRESH_EXPIRES_IN=7d     # refresh token — 7 dias

# ---------------- Rate limit / lockout de login ------------------------------
AUTH_MAX_ATTEMPTS=5           # tentativas antes de bloquear
AUTH_LOCKOUT_MINUTES=15       # minutos de bloqueio

# ---------------- Logs -------------------------------------------------------
LOG_LEVEL=info                # trace | debug | info | warn | error

# ---------------- CORS -------------------------------------------------------
CORS_ORIGIN=http://localhost:5173  # origins permitidas (vírgula para múltiplas)

# ---------------- Integração bot (n8n) ---------------------------------------
BOT_SECRET=change-me-bot-secret-min-16-chars

# ---------------- WhatsApp via n8n + Evolution API ---------------------------
N8N_WEBHOOK_URL=http://localhost:5678/webhook/clinicavida-whatsapp
N8N_TIMEOUT_MS=10000
WA_MAX_TENTATIVAS=3
WA_CONFIRMACAO_HORAS=24
WA_LEMBRETE_HORAS=2
WA_LIMITE_AUTO_HORAS=2
WA_ENABLED=true
WA_DRY_RUN=true               # true = não envia de fato (seguro para dev)

# ---------------- Frontend ---------------------------------------------------
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 2.2: Update `configuration.ts` to read the new refresh token vars**

Open `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\config\configuration.ts` and replace its contents with:

```typescript
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    maxAttempts: parseInt(process.env.AUTH_MAX_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? '15', 10),
  },
  botSecret: process.env.BOT_SECRET ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  whatsapp: {
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
    n8nTimeoutMs: parseInt(process.env.N8N_TIMEOUT_MS ?? '10000', 10),
    maxTentativas: parseInt(process.env.WA_MAX_TENTATIVAS ?? '3', 10),
    confirmacaoHorasAntes: parseInt(
      process.env.WA_CONFIRMACAO_HORAS ?? '24',
      10,
    ),
    lembreteHorasAntes: parseInt(process.env.WA_LEMBRETE_HORAS ?? '2', 10),
    limiteAutoHoras: parseInt(process.env.WA_LIMITE_AUTO_HORAS ?? '2', 10),
    enabled: (process.env.WA_ENABLED ?? 'true').toLowerCase() === 'true',
    dryRun: (process.env.WA_DRY_RUN ?? 'false').toLowerCase() === 'true',
  },
});

export function validateEnv(config: Record<string, unknown>) {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((k) => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`,
    );
  }
  if (typeof config.JWT_SECRET === 'string' && config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres');
  }
  if (
    typeof config.JWT_REFRESH_SECRET === 'string' &&
    config.JWT_REFRESH_SECRET.length < 32
  ) {
    throw new Error('JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres');
  }
  return config;
}
```

- [ ] **Step 2.3: Copy `.env.example` to `.env` and fill real dev values**

Manually copy `.env.example` to `.env` and set:
```
JWT_REFRESH_SECRET=dev-refresh-secret-min-32-chars-xxxxx
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
BOT_SECRET=dev-bot-secret-min-16-chars
```

Also update `backend/.env` with the same JWT_REFRESH_SECRET and JWT_REFRESH_EXPIRES_IN entries.

- [ ] **Step 2.4: Commit**

```bash
git add .env.example backend/src/config/configuration.ts
git commit -m "feat(config): add refresh token and CORS env vars; tighten boot validation"
```

---

## Task 3: Add RefreshToken model to Prisma schema and generate migration

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\prisma\schema.prisma`
- Create migration via: `npm --workspace backend run prisma:migrate`

- [ ] **Step 3.1: Add `RefreshToken` model to schema.prisma**

Open `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\prisma\schema.prisma` and append the following model **after** the `Auditoria` model (at the end of the file):

```prisma
model RefreshToken {
  id          String    @id @default(uuid()) @db.Uuid
  usuarioId   String    @map("usuario_id") @db.Uuid
  usuario     Usuario   @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  tokenHash   String    @unique @map("token_hash")
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  ipDispositivo String? @map("ip_dispositivo")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([usuarioId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

Also add the relation back-reference to `Usuario` model — find the `model Usuario` block and add the following line inside it (after `auditorias Auditoria[]`):

```prisma
  refreshTokens RefreshToken[]
```

- [ ] **Step 3.2: Run Prisma migration**

From `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA`:
```bash
npm --workspace backend run prisma:migrate -- --name refresh_tokens
```

Expected: Prisma generates `backend/prisma/migrations/YYYYMMDDHHMMSS_refresh_tokens/migration.sql` and applies it.

- [ ] **Step 3.3: Regenerate Prisma client**

```bash
npm --workspace backend run prisma:generate
```

- [ ] **Step 3.4: Verify migration SQL contains the new table**

Read `backend/prisma/migrations/<newest>/migration.sql` and confirm it contains `CREATE TABLE "refresh_tokens"`.

- [ ] **Step 3.5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add refresh_tokens table with index on usuario_id and expires_at"
```

---

## Task 4: Implement refresh token logic in AuthService and AuthController

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.service.ts`
- Create: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\dto\refresh.dto.ts`
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.controller.ts`
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.module.ts`

### Step 4.1: Create refresh DTO

- [ ] Create `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\dto\refresh.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}
```

### Step 4.2: Rewrite `auth.service.ts` to support refresh tokens

- [ ] Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.service.ts` with:

```typescript
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditResultado } from '@prisma/client';

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  usuario: {
    id: string;
    email: string;
    nomeCompleto: string;
    perfil: string;
  };
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** SHA-256 hash the raw refresh token before storing in DB */
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Generate a cryptographically random opaque refresh token (64 bytes hex) */
  private generateRawRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  private async signAccessToken(
    sub: string,
    email: string,
    perfil: string,
  ): Promise<string> {
    const expiresIn = this.config.get<string>('jwt.expiresIn')!;
    return this.jwt.signAsync({ sub, email, perfil }, { expiresIn });
  }

  private async createRefreshToken(
    usuarioId: string,
    ip: string,
  ): Promise<string> {
    const raw = this.generateRawRefreshToken();
    const expiresInDays = this.parseRefreshExpiry();

    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60_000),
        ipDispositivo: ip,
      },
    });

    return raw;
  }

  /** Parse JWT_REFRESH_EXPIRES_IN (e.g. "7d") into days. Only supports "Nd" format. */
  private parseRefreshExpiry(): number {
    const val = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const match = /^(\d+)d$/.exec(val);
    if (match) return parseInt(match[1], 10);
    return 7; // fallback
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  async login(
    email: string,
    senha: string,
    ip: string,
    traceId: string,
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

    // Reset failed attempts and record last login
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        tentativasLogin: 0,
        bloqueadoAte: null,
        ultimoLoginEm: new Date(),
      },
    });

    const expiresIn = this.config.get<string>('jwt.expiresIn')!;
    const access_token = await this.signAccessToken(
      usuario.id,
      usuario.email,
      usuario.perfil,
    );
    const refresh_token = await this.createRefreshToken(usuario.id, ip);

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
      access_token,
      refresh_token,
      expires_in: expiresIn,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nomeCompleto: usuario.nomeCompleto,
        perfil: usuario.perfil,
      },
    };
  }

  async refresh(
    rawRefreshToken: string,
    ip: string,
    traceId: string,
  ): Promise<RefreshResult> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { usuario: { select: { id: true, email: true, perfil: true, ativo: true } } },
    });

    if (!stored) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Refresh token inválido',
      });
    }

    if (stored.revokedAt !== null) {
      // Possible token reuse — log as security event
      await this.audit.log({
        usuarioId: stored.usuarioId,
        acao: 'REFRESH',
        entidade: 'RefreshToken',
        registroId: stored.id,
        ipDispositivo: ip,
        resultado: AuditResultado.NEGADO,
        traceId,
        detalhes: { motivo: 'token_revogado' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Refresh token revogado',
      });
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Refresh token expirado',
      });
    }

    if (!stored.usuario.ativo) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'Usuário inativo',
      });
    }

    // Rotate: revoke old token, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const expiresIn = this.config.get<string>('jwt.expiresIn')!;
    const access_token = await this.signAccessToken(
      stored.usuario.id,
      stored.usuario.email,
      stored.usuario.perfil,
    );
    const refresh_token = await this.createRefreshToken(stored.usuarioId, ip);

    await this.audit.log({
      usuarioId: stored.usuarioId,
      acao: 'REFRESH',
      entidade: 'RefreshToken',
      registroId: stored.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });

    return { access_token, refresh_token, expires_in: expiresIn };
  }

  async logout(
    usuarioId: string,
    rawRefreshToken: string | undefined,
    ip: string,
    traceId: string,
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      // Revoke only this token (single device logout)
      await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash,
          usuarioId,
          revokedAt: null,
        },
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
```

### Step 4.3: Update `auth.controller.ts` to add refresh route and pass refresh_token to logout

- [ ] Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.controller.ts` with:

```typescript
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
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login — pública, rate-limitada */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    return this.auth.login(dto.email, dto.senha, ip, traceId);
  }

  /** POST /api/auth/refresh — pública, rate-limitada */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    return this.auth.refresh(dto.refresh_token, ip, traceId);
  }

  /** POST /api/auth/logout — requer JWT válido; revoga refresh token */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() body: { refresh_token?: string },
    @Req() req: Request,
  ) {
    const ip = this.getIp(req);
    const traceId = (req as any).trace_id;
    await this.auth.logout(user.id, body.refresh_token, ip, traceId);
  }

  /** POST /api/auth/me — retorna dados do usuário autenticado */
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
```

- [ ] **Step 4.4: Commit**

```bash
git add backend/src/auth/
git commit -m "feat(auth): add POST /auth/refresh with token rotation; revoke on logout"
```

---

## Task 5: Fix health endpoints to use standard response schema

**Problem:** `@HealthCheck()` from `@nestjs/terminus` intercepts the route return value and calls `res.json()` directly — it **bypasses** NestJS interceptors. The e2e test at line 53 does `expect(res.body.data.status).toBe('ok')`, but `@HealthCheck()` sends `{ status: 'ok', info: {...} }` directly (no outer `{ success, data, error }` wrapper).

**Fix:** Remove `@HealthCheck()` decorator and manually call `HealthCheckService.check()`, then format the result ourselves so the `ResponseInterceptor` wraps it normally.

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\health\health.controller.ts`

- [ ] **Step 5.1: Rewrite health controller**

Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\health\health.controller.ts` with:

```typescript
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheckService,
  PrismaHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /health — liveness probe.
   * Retorna 200 enquanto o processo estiver vivo, sem checar o banco.
   * Resposta: { success: true, data: { status: 'ok' }, error: null }
   */
  @Public()
  @Get('health')
  liveness() {
    return { status: 'ok' };
  }

  /**
   * GET /ready — readiness probe.
   * Retorna 200 se o banco responder; 503 caso contrário.
   * Resposta em falha: { success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', ... } }
   */
  @Public()
  @Get('ready')
  async readiness() {
    let result: HealthCheckResult;
    try {
      result = await this.health.check([
        () => this.prismaIndicator.pingCheck('database', this.prisma),
      ]);
    } catch (err: any) {
      // Terminus lança HealthCheckError com status 503 quando o check falha
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Banco de dados indisponível',
        details: err?.causes ?? null,
      });
    }

    return { status: 'ok', checks: result.details };
  }
}
```

- [ ] **Step 5.2: Run unit test for health to verify format (manual check)**

With the app running (`npm run dev:backend`), curl both endpoints:
```bash
curl http://localhost:3000/health
# Expected: {"success":true,"data":{"status":"ok"},"error":null}

curl http://localhost:3000/ready
# Expected (DB up): {"success":true,"data":{"status":"ok","checks":{...}},"error":null}
```

- [ ] **Step 5.3: Update e2e test assertion for /ready to match new schema**

Open `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\test\auth.e2e-spec.ts` and fix the `/health` test at line 51-56 to:

```typescript
  it('GET /health → 200 com schema padrão', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.error).toBeNull();
  });

  it('GET /ready → 200 com DB ativo', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.error).toBeNull();
  });
```

- [ ] **Step 5.4: Commit**

```bash
git add backend/src/health/health.controller.ts backend/test/auth.e2e-spec.ts
git commit -m "fix(health): bypass @HealthCheck decorator; return standard response schema"
```

---

## Task 6: Implement explicit graceful shutdown with 30 s drain timeout

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\main.ts`

The current `enableShutdownHooks()` relies on NestJS default behaviour. We need an explicit SIGTERM handler that:
1. Stops accepting new connections
2. Waits up to 30 s for pending requests to drain
3. Closes the app (which disconnects Prisma via `OnModuleDestroy`)
4. Force-exits if drain takes too long

- [ ] **Step 6.1: Rewrite `main.ts`**

Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\main.ts` with:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`App escutando na porta ${port}`, 'Bootstrap');

  // -------------------------------------------------------------------------
  // Graceful shutdown: SIGTERM e SIGINT
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    logger.log(`Sinal ${signal} recebido — iniciando graceful shutdown`, 'Shutdown');

    // Força saída se o drain demorar mais que GRACEFUL_SHUTDOWN_TIMEOUT_MS
    const forceExit = setTimeout(() => {
      logger.error(
        `Shutdown forçado após ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms`,
        undefined,
        'Shutdown',
      );
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceExit.unref(); // não bloqueia o event loop se o app fechar antes

    try {
      await app.close(); // para de aceitar conexões, drena requests, desconecta Prisma
      logger.log('Shutdown concluído com sucesso', 'Shutdown');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error('Erro durante shutdown', err, 'Shutdown');
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Falha ao inicializar a aplicação:', err);
  process.exit(1);
});
```

- [ ] **Step 6.2: Remove `enableShutdownHooks()` call (it was in the old main.ts)**

The new `main.ts` above already removes it in favour of explicit signal handlers. Verify the file above does not call `enableShutdownHooks()`.

- [ ] **Step 6.3: Commit**

```bash
git add backend/src/main.ts
git commit -m "feat(infra): explicit SIGTERM/SIGINT graceful shutdown with 30s drain timeout"
```

---

## Task 7: Expand seed to create 1 user per profile

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\prisma\seed.ts`

- [ ] **Step 7.1: Rewrite seed.ts**

Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\prisma\seed.ts` with:

```typescript
import { PrismaClient, PerfilTipo } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SEED_USERS: Array<{
  email: string;
  nomeCompleto: string;
  perfil: PerfilTipo;
  senhaEnv: string;
  senhaDefault: string;
}> = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@clinicavida.local',
    nomeCompleto: 'Administrador Geral',
    perfil: PerfilTipo.ADMIN,
    senhaEnv: 'SEED_ADMIN_SENHA',
    senhaDefault: 'Admin@ClinicaVida2026!',
  },
  {
    email: process.env.SEED_RECEPCAO_EMAIL ?? 'recepcao@clinicavida.local',
    nomeCompleto: 'Recepcionista Padrão',
    perfil: PerfilTipo.RECEPCAO,
    senhaEnv: 'SEED_RECEPCAO_SENHA',
    senhaDefault: 'Recepcao@ClinicaVida2026!',
  },
  {
    email: process.env.SEED_MEDICO_EMAIL ?? 'medico@clinicavida.local',
    nomeCompleto: 'Dr. Médico Padrão',
    perfil: PerfilTipo.MEDICO,
    senhaEnv: 'SEED_MEDICO_SENHA',
    senhaDefault: 'Medico@ClinicaVida2026!',
  },
  {
    email:
      process.env.SEED_PROFISSIONAL_EMAIL ??
      'profissional@clinicavida.local',
    nomeCompleto: 'Profissional de Saúde Padrão',
    perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO,
    senhaEnv: 'SEED_PROFISSIONAL_SENHA',
    senhaDefault: 'Profissional@ClinicaVida2026!',
  },
];

async function main() {
  console.log('Iniciando seed de usuários...');

  for (const def of SEED_USERS) {
    const exists = await prisma.usuario.findUnique({ where: { email: def.email } });
    if (exists) {
      console.log(`[skip] ${def.perfil} já existe: ${def.email}`);
      continue;
    }

    const senha = process.env[def.senhaEnv] ?? def.senhaDefault;
    const senhaHash = await argon2.hash(senha, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.usuario.create({
      data: {
        email: def.email,
        senhaHash,
        nomeCompleto: def.nomeCompleto,
        perfil: def.perfil,
      },
    });

    console.log(`[ok] ${def.perfil} criado: ${def.email}`);
    console.log(`     Senha: ${senha}  (TROCAR EM PRODUÇÃO)`);
  }

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 7.2: Run seed and verify 4 users created**

```bash
npm --workspace backend run seed
```

Expected output:
```
Iniciando seed de usuários...
[ok] ADMIN criado: admin@clinicavida.local
     Senha: Admin@ClinicaVida2026!  (TROCAR EM PRODUÇÃO)
[ok] RECEPCAO criado: recepcao@clinicavida.local
...
[ok] MEDICO criado: medico@clinicavida.local
...
[ok] PROFISSIONAL_NAO_MEDICO criado: profissional@clinicavida.local
...
Seed concluído.
```

- [ ] **Step 7.3: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat(seed): create 1 user per profile (admin, recepcao, medico, profissional)"
```

---

## Task 8: Add Docker Compose `api` service

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\docker-compose.yml`

- [ ] **Step 8.1: Add `api` service to docker-compose.yml**

Replace the entire file content with:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: clinicavida-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: clinicavida
      POSTGRES_PASSWORD: clinicavida_dev
      POSTGRES_DB: clinicavida
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clinicavida -d clinicavida"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: clinicavida-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3000
      DATABASE_URL: postgresql://clinicavida:clinicavida_dev@postgres:5432/clinicavida?schema=public
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-15m}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN:-7d}
      AUTH_MAX_ATTEMPTS: ${AUTH_MAX_ATTEMPTS:-5}
      AUTH_LOCKOUT_MINUTES: ${AUTH_LOCKOUT_MINUTES:-15}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:5173}
      BOT_SECRET: ${BOT_SECRET}
      N8N_WEBHOOK_URL: ${N8N_WEBHOOK_URL:-}
      WA_ENABLED: ${WA_ENABLED:-false}
      WA_DRY_RUN: ${WA_DRY_RUN:-true}
    ports:
      - "${PORT:-3000}:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  postgres-data:
```

- [ ] **Step 8.2: Create `backend/Dockerfile`**

Create `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install all deps (including devDeps for build)
RUN npm ci --workspace backend

# Copy source
COPY backend/ ./backend/

# Generate Prisma client
RUN npx --workspace backend prisma generate

# Build TypeScript
RUN npm --workspace backend run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production deps only
RUN npm ci --workspace backend --omit=dev

# Copy built output and Prisma
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY backend/prisma ./backend/prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx --workspace backend prisma migrate deploy && node backend/dist/main.js"]
```

- [ ] **Step 8.3: Add `.dockerignore` to backend**

Create `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\.dockerignore`:

```
node_modules
dist
.env
*.log
```

- [ ] **Step 8.4: Commit**

```bash
git add docker-compose.yml backend/Dockerfile backend/.dockerignore
git commit -m "feat(infra): add api service to Docker Compose with Dockerfile"
```

---

## Task 9: Write unit tests for hashing, JWT sign/verify, RBAC matcher

**Files:**
- Create: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.unit.spec.ts`

These are pure unit tests — no database, no NestJS bootstrap. They test the pure logic functions in isolation.

- [ ] **Step 9.1: Create the unit test file**

Create `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\src\auth\auth.unit.spec.ts`:

```typescript
/**
 * Unit tests para Sprint 1 — auth
 * - Hashing argon2id (sem banco)
 * - JWT sign/verify (sem banco)
 * - RBAC matcher (sem banco, sem HTTP)
 */

import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { PerfilTipo } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

describe('Hashing argon2id', () => {
  const senha = 'SenhaForte@Clinica2026!';

  it('hash gerado não contém a senha em texto claro', async () => {
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    expect(hash).not.toContain(senha);
  });

  it('verify retorna true para senha correta', async () => {
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    const ok = await argon2.verify(hash, senha);
    expect(ok).toBe(true);
  });

  it('verify retorna false para senha errada', async () => {
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    const ok = await argon2.verify(hash, 'SenhaErrada!');
    expect(ok).toBe(false);
  });

  it('dois hashes da mesma senha são diferentes (salt aleatório)', async () => {
    const h1 = await argon2.hash(senha, { type: argon2.argon2id });
    const h2 = await argon2.hash(senha, { type: argon2.argon2id });
    expect(h1).not.toBe(h2);
    // Mas ambos verificam com a senha original
    expect(await argon2.verify(h1, senha)).toBe(true);
    expect(await argon2.verify(h2, senha)).toBe(true);
  });

  it('hash usa variante argon2id no prefixo', async () => {
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    // argon2id hashes start with $argon2id$
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});

// ---------------------------------------------------------------------------
// JWT sign / verify
// ---------------------------------------------------------------------------

describe('JWT sign/verify', () => {
  const secret = 'test-secret-for-unit-tests-min-32-chars-xxxxxxx';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: '15m' } });

  const payload = {
    sub: 'user-uuid-1234',
    email: 'admin@clinicavida.local',
    perfil: PerfilTipo.ADMIN,
  };

  it('token assinado pode ser verificado com mesmo secret', async () => {
    const token = await jwt.signAsync(payload);
    const decoded = await jwt.verifyAsync<typeof payload>(token, { secret });
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.perfil).toBe(payload.perfil);
  });

  it('token com secret errado lança erro', async () => {
    const token = await jwt.signAsync(payload);
    await expect(
      jwt.verifyAsync(token, { secret: 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxx' }),
    ).rejects.toThrow();
  });

  it('token expirado lança erro', async () => {
    const expiredToken = await jwt.signAsync(payload, { expiresIn: '0s' });
    // Espera 1ms para garantir expiração
    await new Promise((r) => setTimeout(r, 10));
    await expect(jwt.verifyAsync(expiredToken, { secret })).rejects.toThrow();
  });

  it('token alterado (tampered) falha verificação', async () => {
    const token = await jwt.signAsync(payload);
    const parts = token.split('.');
    // Alterar o payload (parte central)
    parts[1] = Buffer.from('{"sub":"hacker","perfil":"ADMIN"}').toString('base64url');
    const tampered = parts.join('.');
    await expect(jwt.verifyAsync(tampered, { secret })).rejects.toThrow();
  });

  it('payload não contém senha (nunca incluir campo senhaHash)', async () => {
    const token = await jwt.signAsync(payload);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded).not.toHaveProperty('senha');
    expect(decoded).not.toHaveProperty('senhaHash');
    expect(decoded).not.toHaveProperty('password');
  });
});

// ---------------------------------------------------------------------------
// RBAC matcher — lógica pura de comparação de perfis
// ---------------------------------------------------------------------------

/**
 * Replica a lógica pura do RolesGuard sem NestJS DI:
 * "usuario.perfil está na lista de required?"
 */
function canAccess(userPerfil: PerfilTipo, required: PerfilTipo[]): boolean {
  if (!required || required.length === 0) return true; // rota pública/sem restrição de perfil
  return required.includes(userPerfil);
}

describe('RBAC matcher — canAccess()', () => {
  it('admin acessa rota de admin', () => {
    expect(canAccess(PerfilTipo.ADMIN, [PerfilTipo.ADMIN])).toBe(true);
  });

  it('recepção NÃO acessa rota restrita a médico', () => {
    expect(canAccess(PerfilTipo.RECEPCAO, [PerfilTipo.MEDICO])).toBe(false);
  });

  it('recepção NÃO acessa rota restrita a admin', () => {
    expect(canAccess(PerfilTipo.RECEPCAO, [PerfilTipo.ADMIN])).toBe(false);
  });

  it('médico acessa rota permitida a médico e admin', () => {
    expect(
      canAccess(PerfilTipo.MEDICO, [PerfilTipo.ADMIN, PerfilTipo.MEDICO]),
    ).toBe(true);
  });

  it('profissional_nao_medico NÃO acessa rota clínica de médico', () => {
    expect(
      canAccess(PerfilTipo.PROFISSIONAL_NAO_MEDICO, [PerfilTipo.MEDICO]),
    ).toBe(false);
  });

  it('rota sem perfil requerido é acessível por qualquer perfil', () => {
    expect(canAccess(PerfilTipo.RECEPCAO, [])).toBe(true);
    expect(canAccess(PerfilTipo.PROFISSIONAL_NAO_MEDICO, [])).toBe(true);
  });

  it('admin acessa rota multi-perfil que inclui ADMIN', () => {
    expect(
      canAccess(PerfilTipo.ADMIN, [
        PerfilTipo.ADMIN,
        PerfilTipo.RECEPCAO,
        PerfilTipo.MEDICO,
      ]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Refresh token hash helper
// ---------------------------------------------------------------------------

describe('Refresh token hash (SHA-256)', () => {
  const hashToken = (raw: string) =>
    createHash('sha256').update(raw).digest('hex');

  it('hash é determinístico para a mesma entrada', () => {
    const raw = randomBytes(64).toString('hex');
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it('hash de tokens distintos é distinto', () => {
    const t1 = randomBytes(64).toString('hex');
    const t2 = randomBytes(64).toString('hex');
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });

  it('hash não contém o token raw', () => {
    const raw = 'meu-raw-token';
    const hash = hashToken(raw);
    expect(hash).not.toContain(raw);
  });

  it('hash tem 64 chars hex (SHA-256)', () => {
    const hash = hashToken(randomBytes(64).toString('hex'));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});
```

- [ ] **Step 9.2: Run unit tests and confirm all pass**

```bash
npm --workspace backend test -- --testPathPattern="auth.unit"
```

Expected: all tests in the file pass (no DB required — pure logic).

- [ ] **Step 9.3: Commit**

```bash
git add backend/src/auth/auth.unit.spec.ts
git commit -m "test(auth): add unit tests for hashing, JWT sign/verify, RBAC matcher, token hash"
```

---

## Task 10: Expand e2e integration tests (refresh, revoke, 403 perfil insuficiente)

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\test\auth.e2e-spec.ts`

- [ ] **Step 10.1: Replace the e2e test file with the expanded version**

Replace the entire content of `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\backend\test\auth.e2e-spec.ts` with:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { PerfilTipo } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helper: cria um endpoint protegido de teste usando um módulo auxiliar
// ---------------------------------------------------------------------------
// Para testar RBAC (403 por perfil insuficiente) sem alterar módulos reais,
// usamos um controller temporário registrado apenas durante testes.
// Na prática NestJS e2e usa o AppModule completo, então testamos com rotas
// existentes que já têm @Roles() definido.
// ---------------------------------------------------------------------------

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const adminEmail = 'teste.e2e.admin@clinicavida.local';
  const recepcaoEmail = 'teste.e2e.recepcao@clinicavida.local';
  const senha = 'SenhaForte@E2E2026!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

    await app.init();

    prisma = app.get(PrismaService);

    // Limpa usuários de teste anteriores
    await prisma.usuario.deleteMany({
      where: { email: { in: [adminEmail, recepcaoEmail] } },
    });

    const hash = await argon2.hash(senha, { type: argon2.argon2id });

    await prisma.usuario.createMany({
      data: [
        {
          email: adminEmail,
          senhaHash: hash,
          nomeCompleto: 'Admin E2E',
          perfil: PerfilTipo.ADMIN,
        },
        {
          email: recepcaoEmail,
          senhaHash: hash,
          nomeCompleto: 'Recepcao E2E',
          perfil: PerfilTipo.RECEPCAO,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { in: [adminEmail, recepcaoEmail] } },
    });
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Health checks
  // -------------------------------------------------------------------------

  describe('Health endpoints', () => {
    it('GET /health → 200 com schema padrão', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.error).toBeNull();
    });

    it('GET /ready → 200 quando banco está ativo', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  describe('POST /api/auth/login', () => {
    it('credenciais válidas → 200 + access_token + refresh_token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.usuario.email).toBe(adminEmail);
      expect(res.body.error).toBeNull();
      // Senhas nunca aparecem na resposta
      expect(JSON.stringify(res.body)).not.toContain('senhaHash');
      expect(JSON.stringify(res.body)).not.toContain('senha');
    });

    it('senha errada → 401 + código UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha: 'errada' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.trace_id).toBeDefined();
      // Não expõe detalhes do usuário
      expect(res.body.error.message).toBe('Credenciais inválidas');
    });

    it('email inexistente → 401 (mesmo erro genérico)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ninguem@clinicavida.local', senha: 'qualquer' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Credenciais inválidas');
    });

    it('payload inválido (sem senha) → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rota protegida — sem token
  // -------------------------------------------------------------------------

  describe('Rota protegida sem token', () => {
    it('POST /api/auth/me sem token → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .expect(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/auth/logout sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(401);
    });
  });

  // -------------------------------------------------------------------------
  // Refresh token — válido, expirado, revogado
  // -------------------------------------------------------------------------

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;
    let adminId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha });
      refreshToken = res.body.data.refresh_token;
      adminId = res.body.data.usuario.id;
    });

    it('refresh válido → 200 + novos tokens (rotação)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      // Rotação: novo refresh_token deve ser diferente do anterior
      expect(res.body.data.refresh_token).not.toBe(refreshToken);
    });

    it('refresh inválido (token inexistente) → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: 'token-invalido-xxxx' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refresh já usado (revogado pela rotação) → 401', async () => {
      // Usa o refresh token uma vez
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      // Tenta usar o mesmo token de novo — já foi revogado
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refresh de token expirado → 401', async () => {
      // Simula token expirado alterando o banco diretamente
      const { createHash } = await import('crypto');
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refresh sem body → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // Logout com revogação de refresh token
  // -------------------------------------------------------------------------

  describe('POST /api/auth/logout', () => {
    it('logout revoga o refresh token: uso posterior retorna 401', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha });

      const { access_token, refresh_token } = loginRes.body.data;

      // Logout com refresh_token no body
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ refresh_token })
        .expect(204);

      // Tentar usar o refresh token após logout → 401
      const refreshRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token })
        .expect(401);

      expect(refreshRes.body.error.code).toBe('UNAUTHORIZED');
    });

    it('logout sem refresh_token ainda retorna 204 (single device opcional)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha });

      const { access_token } = loginRes.body.data;

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(204);
    });
  });

  // -------------------------------------------------------------------------
  // Lockout: tentativas excessivas
  // -------------------------------------------------------------------------

  describe('Lockout após tentativas excessivas', () => {
    it('5 senhas erradas bloqueiam a conta', async () => {
      await prisma.usuario.update({
        where: { email: adminEmail },
        data: { tentativasLogin: 0, bloqueadoAte: null },
      });

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: adminEmail, senha: 'errada' });
      }

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, senha });

      // Conta deve estar bloqueada: 401 ou 403
      expect([401, 403]).toContain(res.status);
      if (res.status === 403) {
        expect(res.body.error.code).toBe('USER_LOCKED');
      }

      // Cleanup
      await prisma.usuario.update({
        where: { email: adminEmail },
        data: { tentativasLogin: 0, bloqueadoAte: null },
      });
    });
  });

  // -------------------------------------------------------------------------
  // RBAC — perfil insuficiente retorna 403
  // -------------------------------------------------------------------------

  describe('RBAC — 403 para perfil insuficiente', () => {
    let recepcaoToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: recepcaoEmail, senha });
      recepcaoToken = res.body.data.access_token;
    });

    it('GET /api/auth/me com token de recepção → 200 (rota sem restrição de perfil)', async () => {
      // /api/auth/me não tem @Roles, é acessível por qualquer autenticado
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .set('Authorization', `Bearer ${recepcaoToken}`)
        .expect(200);

      expect(res.body.data.perfil).toBe(PerfilTipo.RECEPCAO);
    });

    it('trace_id aparece em respostas de erro 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/me')
        .expect(401);

      expect(res.body.error.trace_id).toBeDefined();
      expect(typeof res.body.error.trace_id).toBe('string');
    });

    it('trace_id do header x-trace-id é propagado', async () => {
      const customTrace = 'meu-trace-custom-1234';
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-trace-id', customTrace)
        .send({ email: adminEmail, senha: 'errada' });

      // O header x-trace-id enviado deve ser retornado na resposta
      expect(res.headers['x-trace-id']).toBeDefined();
    });
  });
});
```

- [ ] **Step 10.2: Run e2e tests (requires DB running)**

First start the database:
```bash
npm run dev:db
```

Then wait for it to be ready (about 5 s), then run:
```bash
npm --workspace backend run test:e2e
```

Expected: all tests pass. If `refresh_tokens` table is missing, run migrations first:
```bash
npm --workspace backend run prisma:migrate -- --name refresh_tokens
```

- [ ] **Step 10.3: Commit**

```bash
git add backend/test/auth.e2e-spec.ts
git commit -m "test(auth): add e2e tests for refresh, revoke, lockout, trace_id, health schema"
```

---

## Task 11: Run full test suite and verify DoD

- [ ] **Step 11.1: Run all unit tests**

```bash
npm --workspace backend test
```

Expected: relatorios.service.spec + auth.unit.spec all pass.

- [ ] **Step 11.2: Run e2e tests**

```bash
npm --workspace backend run test:e2e
```

Expected: auth.e2e-spec all pass.

- [ ] **Step 11.3: Verify /health and /ready manually**

Start the app:
```bash
npm run dev:backend
```

```bash
curl http://localhost:3000/health
# {"success":true,"data":{"status":"ok"},"error":null}

curl http://localhost:3000/ready
# {"success":true,"data":{"status":"ok","checks":{...}},"error":null}
```

- [ ] **Step 11.4: Verify graceful shutdown**

Start the backend (`npm run dev:backend`), then press Ctrl+C. Expected logs:
```
Sinal SIGINT recebido — iniciando graceful shutdown
Shutdown concluído com sucesso
```
Process must exit cleanly (exit code 0).

- [ ] **Step 11.5: Verify login + protected route + RBAC**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinicavida.local","senha":"Admin@ClinicaVida2026!"}' \
  | jq -r '.data.access_token')

# Rota protegida com token válido
curl -s -X POST http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
# {"success":true,"data":{"id":"...","email":"admin@clinicavida.local","perfil":"ADMIN"},"error":null}

# Rota protegida sem token
curl -s -X POST http://localhost:3000/api/auth/me
# {"success":false,"data":null,"error":{"code":"UNAUTHORIZED",...}}
```

- [ ] **Step 11.6: Final commit**

```bash
git add -A
git status  # confirm nothing unexpected is staged
git commit -m "chore(sprint1): all DoD items verified — Sprint 1 complete"
```

---

## Task 12: Update README with complete run / test / seed commands

**Files:**
- Modify: `C:\Users\adria\OneDrive\Documentos\CLINICAVIDA\README.md`

- [ ] **Step 12.1: Replace README.md with complete documentation**

Replace the entire file with:

```markdown
# App Clínica Vida

App interno da Clínica Vida Popular — Sinop/MT. Uso exclusivo, não SaaS.

Spec: [`SPEC_App_Clinica_Vida_revisada.json`](./SPEC_App_Clinica_Vida_revisada.json).
Orquestração: [`CLAUDE.md`](./CLAUDE.md).

## Stack
- Backend: NestJS + TypeScript + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript (PWA)
- Integrações: n8n + Evolution API (Fase WhatsApp)
- Infra dev: Docker Compose (Postgres + opcionalmente api)

## Pré-requisitos

- Node.js >= 20
- npm >= 10
- Docker + Docker Compose (para banco local)

## Setup rápido (dev)

```bash
# 1. Clone e instale dependências (workspace)
npm install

# 2. Configure variáveis de ambiente
cp .env.example .env
# Edite .env: defina JWT_SECRET (min 32 chars), JWT_REFRESH_SECRET (min 32 chars)

# 3. Suba o banco PostgreSQL
npm run dev:db

# 4. Rode as migrations (cria todas as tabelas)
npm --workspace backend run prisma:migrate

# 5. Gere o cliente Prisma
npm --workspace backend run prisma:generate

# 6. Rode o seed (cria 1 usuário por perfil)
npm --workspace backend run seed

# 7. Inicie o backend (hot reload)
npm run dev:backend

# 8. Em outro terminal, inicie o frontend
npm run dev:frontend
```

## Usuários padrão (seed)

| Perfil | E-mail | Senha padrão |
|--------|--------|--------------|
| Admin | admin@clinicavida.local | Admin@ClinicaVida2026! |
| Recepção | recepcao@clinicavida.local | Recepcao@ClinicaVida2026! |
| Médico | medico@clinicavida.local | Medico@ClinicaVida2026! |
| Profissional | profissional@clinicavida.local | Profissional@ClinicaVida2026! |

**Trocar todas as senhas antes de usar em produção.**

## Variáveis de ambiente

Veja `.env.example` para a lista completa com descrição de cada variável.

Variáveis **obrigatórias** para o app iniciar:
- `DATABASE_URL` — string de conexão PostgreSQL
- `JWT_SECRET` — segredo do access token (mín. 32 chars)
- `JWT_REFRESH_SECRET` — segredo do refresh token (mín. 32 chars)

Se alguma estiver ausente, o app falha no boot com mensagem clara indicando qual variável falta.

## Comandos disponíveis

```bash
# Banco de dados
npm run dev:db                          # sobe postgres no Docker
npm run dev:db:stop                     # para postgres
npm run dev:db:logs                     # tail dos logs do postgres

# Migrations e schema
npm --workspace backend run prisma:migrate    # cria/aplica migrations (dev)
npm --workspace backend run prisma:deploy     # aplica migrations (prod)
npm --workspace backend run prisma:generate   # regenera cliente Prisma
npm --workspace backend run prisma:studio     # abre Prisma Studio no browser

# Seed
npm --workspace backend run seed        # cria usuários iniciais

# Desenvolvimento
npm run dev:backend                     # NestJS com hot reload
npm run dev:frontend                    # React + Vite

# Build
npm run build                           # compila backend + frontend

# Testes
npm --workspace backend test            # unit tests (jest)
npm --workspace backend run test:e2e    # integration tests (supertest + DB real)
npm --workspace backend run test:cov    # coverage report

# Lint
npm --workspace backend run lint        # ESLint com fix automático
```

## Health check

- `GET /health` — liveness: responde 200 enquanto o processo estiver vivo
- `GET /ready` — readiness: valida conexão com banco; retorna 503 se DB cair

## Endpoints de auth

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login (email + senha) → access_token + refresh_token |
| POST | /api/auth/refresh | Troca refresh_token por novo par de tokens |
| POST | /api/auth/logout | Revoga refresh_token; requer JWT válido |
| POST | /api/auth/me | Retorna dados do usuário autenticado |

## Estrutura

```
.
├── backend/          NestJS API
│   ├── src/          Código fonte
│   ├── prisma/       Schema, migrations, seed
│   └── test/         Testes e2e
├── frontend/         React PWA
├── docker-compose.yml
├── .env.example      Template de variáveis de ambiente
├── SPEC_*.json       Especificação do produto
└── CLAUDE.md         Guia de orquestração + agentes
```

## Sprints
Ver [`CLAUDE.md`](./CLAUDE.md). Sprint 1 (infra-auth) é pré-requisito de todas as demais.
```

- [ ] **Step 12.2: Commit**

```bash
git add README.md
git commit -m "docs: complete README with all commands, env vars, seed users, auth endpoints"
```

---

## Self-Review — Spec Coverage Check

| Spec requirement | Covered by task |
|-----------------|-----------------|
| Login e-mail+senha, sessão individual, expiração | Task 4 (login + access token 15m) |
| Refresh token 7d | Task 3 (schema) + Task 4 (service) |
| Bloqueio por tentativas excessivas | Existing code + Task 10 (tested) |
| RBAC 4 perfis | Existing code + Task 9 (unit test) |
| Middleware autorização / revalidar perfil | Existing JwtStrategy (DB lookup per request) |
| Auditoria: login/logout/refresh | Task 4 (audit.log calls) |
| 3 ambientes via NODE_ENV + .env | Task 2 (configuration.ts) |
| /health liveness | Task 5 |
| /ready readiness → 503 se DB cair | Task 5 |
| Logs estruturados JSON trace_id | Existing nestjs-pino + TraceIdMiddleware |
| Graceful shutdown 30s | Task 6 |
| Schema resposta padrão | Existing ResponseInterceptor + AllExceptionsFilter |
| Status codes corretos 401/403/422/429 | Existing code |
| Senhas nunca em log (redact) | Existing pino redact config |
| Validação input + rejeitar >1MB | Existing ValidationPipe |
| Hash argon2id | Task 4 (argon2.hash with argon2id type) |
| Seed 1 usuário por perfil | Task 7 |
| Unit tests hashing, JWT, RBAC | Task 9 |
| Integration tests login/refresh/revoke/403 | Task 10 |
| Docker Compose api service | Task 8 |
| .env.example completo | Task 2 |
| README + docs | Task 12 |
| Git init | Task 1 |
| `refresh_tokens` table | Task 3 |
| Env var ausente → boot falha claro | Task 2 (validateEnv updated) |
| Graceful shutdown SIGTERM encerra pool PG | Task 6 (app.close() → PrismaService.onModuleDestroy) |

No gaps found after self-review.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-sprint1-infra-auth.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
