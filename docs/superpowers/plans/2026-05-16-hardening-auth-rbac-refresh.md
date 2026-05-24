# Hardening Auth/RBAC/Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 security/correctness gaps (authorization, data exposure, refresh token, RBAC, health, env, audit) across backend NestJS + frontend React without altering business rules.

**Architecture:** All fixes are isolated to existing files and follow existing patterns — no new modules, no schema changes. Backend fixes use `CallerCtx` pattern already established in `AgendaService`. Frontend refresh uses Axios interceptor queue to avoid concurrent refresh loops.

**Tech Stack:** NestJS 10, Prisma 5, Argon2, JWT, React 18, Vite, Axios, Zustand, Vitest, Jest/Supertest.

---

## Critical Problems Found

| # | Severity | Location | Problem |
|---|----------|----------|---------|
| 1 | CRITICAL | `agenda.controller.ts` | MEDICO/PROFISSIONAL_NAO_MEDICO can list ALL appointments; no ownership check on `GET /`, `GET /:id`, `POST /:id/chamar`, `POST /:id/atendido` |
| 2 | CRITICAL | `pacientes.service.ts:findOne()` | Returns full Prisma object (incl. `observacoes`, `responsavelCpf`, `endereco`) to ALL profiles incl. PROFISSIONAL_NAO_MEDICO |
| 3 | CRITICAL | `store/auth.ts` + `api/client.ts` | No refresh token stored; 401 interceptor immediately clears session instead of attempting refresh |
| 4 | HIGH | `App.tsx` | `PrivateRoute` checks only `token != null`; all routes accessible to all profiles |
| 5 | MEDIUM | `docker-compose.yml:55` | Healthcheck targets `/health` (liveness, no DB check) instead of `/ready` |
| 6 | MEDIUM | `config/configuration.ts` | `TV_SECRET` missing from `validateEnv()` required list |
| 7 | LOW | `auth.service.ts:69,307` | `expiresAt` for DB refresh token record hardcoded to `SEVEN_DAYS_MS`, diverges if `JWT_REFRESH_EXPIRES_IN` changed |
| 8 | MEDIUM | `roles.guard.ts` | `ForbiddenException` thrown but never logged to audit trail |
| 9 | MEDIUM | `test/` | Missing: `/health`+`/ready` e2e, agenda ownership violation tests, patient data restriction tests |

---

## Task 1: Fix Agenda Authorization — Ownership Enforcement

**Files:**
- Modify: `backend/src/agenda/agenda.controller.ts`
- Modify: `backend/src/agenda/agenda.service.ts`

**Root cause:** `findAll()` receives no user context so can't enforce ownership. `findOne()`, `chamar()`, `atendido()` have no ownership check for MEDICO/PROFISSIONAL_NAO_MEDICO.

**Rule (spec):** MEDICO and PROFISSIONAL_NAO_MEDICO see/act only on own appointments. ADMIN and RECEPCAO see all.

- [ ] **Step 1: Add ownership check helper to AgendaService**

In `backend/src/agenda/agenda.service.ts`, after the `STATUS_ATIVOS` constant add a private method:

```typescript
/** Throws 403 if caller is MEDICO/PROFISSIONAL_NAO_MEDICO and does not own the agendamento */
private assertOwnership(
  ag: { profissionalId: string },
  ctx: CallerCtx,
  callerProfissionalId?: string,
): void {
  const restricted: PerfilTipo[] = [
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  ];
  if (!restricted.includes(ctx.perfil)) return;
  if (!callerProfissionalId || ag.profissionalId !== callerProfissionalId) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Profissional só pode acessar a própria agenda',
    });
  }
}
```

- [ ] **Step 2: Add ownership-aware `findAllForCaller` method to AgendaService**

Replace the existing `findAll()` signature by adding an optional second parameter:

```typescript
findAll(query: QueryAgendamentosDto, callerCtx?: { perfil: PerfilTipo; profissionalId?: string }) {
  const where: Prisma.AgendamentoWhereInput = {};
  if (query.profissionalId) where.profissionalId = query.profissionalId;
  if (query.pacienteId) where.pacienteId = query.pacienteId;
  if (query.status) where.status = query.status;
  if (query.inicio || query.fim) {
    where.dataHoraInicio = {};
    if (query.inicio)
      (where.dataHoraInicio as Prisma.DateTimeFilter).gte = new Date(query.inicio);
    if (query.fim)
      (where.dataHoraInicio as Prisma.DateTimeFilter).lte = new Date(query.fim);
  }

  // Enforce ownership: MEDICO and PROFISSIONAL_NAO_MEDICO see only own schedule
  const restricted: PerfilTipo[] = [PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO];
  if (callerCtx && restricted.includes(callerCtx.perfil)) {
    if (!callerCtx.profissionalId) {
      // User has restricted profile but no linked profissional record — return empty
      return Promise.resolve([]);
    }
    // Override any profissionalId from query — must always be own
    where.profissionalId = callerCtx.profissionalId;
  }

  return this.prisma.agendamento.findMany({
    where,
    orderBy: { dataHoraInicio: 'asc' },
    include: {
      paciente: {
        select: { id: true, nomeCompleto: true, telefoneWhatsapp: true },
      },
      profissional: { select: { id: true, nomeCompleto: true, cor: true } },
    },
    take: 500,
  });
}
```

- [ ] **Step 3: Add ownership-aware `findOneForCaller` to AgendaService**

Add new method (keep existing `findOne` used internally):

```typescript
async findOneForCaller(id: string, ctx: CallerCtx, callerProfissionalId?: string) {
  const ag = await this.findOne(id);
  this.assertOwnership(ag, ctx, callerProfissionalId);
  return ag;
}
```

- [ ] **Step 4: Update AgendaController — enforce ownership in GET / and GET /:id**

In `backend/src/agenda/agenda.controller.ts`, update `findAll` and `findOne` handlers:

```typescript
@Get()
async findAll(
  @Query() q: QueryAgendamentosDto,
  @CurrentUser() user: AuthUser,
) {
  const profId = await this.profissionalDoUser(user.id);
  return this.agenda.findAll(q, {
    perfil: user.perfil as PerfilTipo,
    profissionalId: profId,
  });
}

@Get(':id')
async findOne(
  @Param('id', new ParseUUIDPipe()) id: string,
  @CurrentUser() user: AuthUser,
  @Req() req: Request,
) {
  const profId = await this.profissionalDoUser(user.id);
  return this.agenda.findOneForCaller(id, this.ctx(req, user), profId);
}
```

- [ ] **Step 5: Update `chamar` and `atendido` handlers to check ownership**

```typescript
@Post(':id/chamar')
@HttpCode(HttpStatus.OK)
@Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO, PerfilTipo.ADMIN)
async chamar(
  @Param('id', new ParseUUIDPipe()) id: string,
  @CurrentUser() user: AuthUser,
  @Req() req: Request,
) {
  const profId = await this.profissionalDoUser(user.id);
  // findOneForCaller throws 403 if not own appointment
  await this.agenda.findOneForCaller(id, this.ctx(req, user), profId);
  return this.agenda.chamar(id, this.ctx(req, user));
}

@Post(':id/atendido')
@HttpCode(HttpStatus.OK)
@Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO, PerfilTipo.ADMIN)
async atendido(
  @Param('id', new ParseUUIDPipe()) id: string,
  @CurrentUser() user: AuthUser,
  @Req() req: Request,
) {
  const profId = await this.profissionalDoUser(user.id);
  await this.agenda.findOneForCaller(id, this.ctx(req, user), profId);
  return this.agenda.marcarAtendido(id, this.ctx(req, user));
}
```

- [ ] **Step 6: Compile check**

```bash
npm --workspace backend run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

---

## Task 2: Fix Patient Data Restriction by Profile

**Files:**
- Modify: `backend/src/pacientes/pacientes.service.ts`
- Modify: `backend/src/pacientes/pacientes.controller.ts`

**Rule (spec):** PROFISSIONAL_NAO_MEDICO sees only basic fields: `id`, `nomeCompleto`, `dataNascimento`, `sexo`, `telefoneWhatsapp`. Never `observacoes`, `responsavelNome`, `responsavelCpf`, `endereco`.

- [ ] **Step 1: Add `CAMPOS_BASICOS` constant to pacientes.service.ts**

Add after imports at top of file:

```typescript
import { PerfilTipo } from '@prisma/client';

const CAMPOS_BASICOS = {
  id: true,
  nomeCompleto: true,
  dataNascimento: true,
  sexo: true,
  telefoneWhatsapp: true,
  updatedAt: true,
} as const;
```

- [ ] **Step 2: Update `findOne()` signature to accept perfil**

Replace the existing `findOne(id: string)` with:

```typescript
async findOne(id: string, perfil?: PerfilTipo) {
  const raw = await this.prisma.paciente.findFirst({
    where: { id, deletedAt: null },
  });
  if (!raw) {
    throw new NotFoundException({
      code: 'PACIENTE_NAO_ENCONTRADO',
      message: 'Paciente não encontrado',
    });
  }
  if (perfil === PerfilTipo.PROFISSIONAL_NAO_MEDICO) {
    const { id, nomeCompleto, dataNascimento, sexo, telefoneWhatsapp, updatedAt } = raw;
    return { id, nomeCompleto, dataNascimento, sexo, telefoneWhatsapp, updatedAt };
  }
  return raw;
}
```

- [ ] **Step 3: Update internal `findOne` calls in `update()` and `softDelete()`**

These internal calls need the full object regardless of profile. They already call `this.findOne(id)` without perfil (perfil=undefined → returns full object). No change needed — the parameter is optional and defaults to undefined = full object.

Verify by searching: in `pacientes.service.ts`, every internal call to `this.findOne(id)` without perfil returns full object. ✓

- [ ] **Step 4: Update PacientesController to pass perfil to findOne**

In `backend/src/pacientes/pacientes.controller.ts`, update the `findOne` handler:

```typescript
@Get(':id')
findOne(
  @Param('id', new ParseUUIDPipe()) id: string,
  @CurrentUser() user: AuthUser,
) {
  return this.pacientes.findOne(id, user.perfil as PerfilTipo);
}
```

- [ ] **Step 5: Compile check**

```bash
npm --workspace backend run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

---

## Task 3: Implement Refresh Token in Frontend

**Files:**
- Modify: `frontend/src/store/auth.ts`
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/LoginPage.tsx`

**Rule:** On 401 → attempt `POST /auth/refresh` with stored `refreshToken` → if success, update tokens in store and retry original request → if refresh fails or no refreshToken, clear store and redirect to `/login`.

- [ ] **Step 1: Update auth store to store refreshToken**

Replace `frontend/src/store/auth.ts` completely:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  nomeCompleto: string;
  perfil: 'ADMIN' | 'RECEPCAO' | 'MEDICO' | 'PROFISSIONAL_NAO_MEDICO';
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, refreshToken: string, user: AuthUser) => void;
  updateTokens: (token: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, refreshToken, user) =>
        set({ token, refreshToken, user }),
      updateTokens: (token, refreshToken) =>
        set({ token, refreshToken }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'clinicavida-auth' },
  ),
);
```

- [ ] **Step 2: Update auth API module to include refresh_token and expose refresh()**

Replace `frontend/src/api/auth.ts`:

```typescript
import { api } from './client';
import type { AuthUser } from '../store/auth';

interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: string;
    usuario: AuthUser;
  };
}

interface RefreshResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: string;
  };
}

export async function login(email: string, senha: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    senha,
  });
  return data.data;
}

export async function refreshTokens(refreshToken: string) {
  const { data } = await api.post<RefreshResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return data.data;
}

export async function logout(refreshToken?: string) {
  await api.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
}
```

- [ ] **Step 3: Implement refresh interceptor in client.ts**

Replace `frontend/src/api/client.ts`:

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Queue of pending requests waiting for token refresh
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  refreshQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401, not on the refresh endpoint itself
    if (
      err.response?.status !== 401 ||
      original._retry ||
      original.url === '/auth/refresh'
    ) {
      return Promise.reject(err);
    }

    const { refreshToken } = useAuthStore.getState();

    if (!refreshToken) {
      useAuthStore.getState().clear();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Inline the refresh call to avoid the interceptor recursion guard
      const { data: refreshData } = await axios.post<{
        success: boolean;
        data: { access_token: string; refresh_token: string };
      }>('/api/auth/refresh', { refresh_token: refreshToken });

      const { access_token, refresh_token } = refreshData.data;
      useAuthStore.getState().updateTokens(access_token, refresh_token);
      processQueue(null, access_token);

      original.headers.Authorization = `Bearer ${access_token}`;
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      useAuthStore.getState().clear();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
```

- [ ] **Step 4: Update LoginPage to pass refreshToken to setSession**

In `frontend/src/pages/LoginPage.tsx`, update the `handleSubmit` function:

```typescript
// change this line:
setSession(res.access_token, res.usuario);
// to:
setSession(res.access_token, res.refresh_token, res.usuario);
```

- [ ] **Step 5: TypeScript build check**

```bash
npm --workspace frontend run build 2>&1 | tail -10
```

Expected: no type errors.

---

## Task 4: Frontend RBAC — Role-based Route Protection

**Files:**
- Create: `frontend/src/components/RoleRoute.tsx`
- Modify: `frontend/src/App.tsx`

**Rule:** Each route has an allowed-profiles list. Authenticated user without matching profile gets redirected to `/` (not `/login`).

- [ ] **Step 1: Create RoleRoute component**

Create `frontend/src/components/RoleRoute.tsx`:

```typescript
import { Navigate } from 'react-router-dom';
import { useAuthStore, type AuthUser } from '../store/auth';

type Perfil = AuthUser['perfil'];

interface Props {
  children: JSX.Element;
  allow: Perfil[];
}

export default function RoleRoute({ children, allow }: Props) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (!user || !allow.includes(user.perfil)) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 2: Update App.tsx with role-based routes**

Replace the `App.tsx` `Routes` block:

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PacientesListPage from './pages/PacientesListPage';
import PacienteNovoPage from './pages/PacienteNovoPage';
import PacienteEditarPage from './pages/PacienteEditarPage';
import AgendaPage from './pages/AgendaPage';
import AgendaNovoPage from './pages/AgendaNovoPage';
import WhatsappPendentesPage from './pages/WhatsappPendentesPage';
import RecepcaoPage from './pages/RecepcaoPage';
import PainelTVPage from './pages/PainelTVPage';
import RelatoriosPage from './pages/RelatoriosPage';
import { useAuthStore } from './store/auth';
import RoleRoute from './components/RoleRoute';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* All authenticated profiles */}
      <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
      <Route path="/agenda" element={<PrivateRoute><AgendaPage /></PrivateRoute>} />
      <Route path="/recepcao" element={<PrivateRoute><RecepcaoPage /></PrivateRoute>} />

      {/* Patient list: all profiles (restricted data by backend) */}
      <Route path="/pacientes" element={<PrivateRoute><PacientesListPage /></PrivateRoute>} />
      <Route path="/pacientes/:id" element={<PrivateRoute><PacienteEditarPage /></PrivateRoute>} />

      {/* Create/edit patients: ADMIN and RECEPCAO only */}
      <Route
        path="/pacientes/novo"
        element={
          <RoleRoute allow={['ADMIN', 'RECEPCAO']}>
            <PacienteNovoPage />
          </RoleRoute>
        }
      />

      {/* New appointment: ADMIN and RECEPCAO only */}
      <Route
        path="/agenda/novo"
        element={
          <RoleRoute allow={['ADMIN', 'RECEPCAO']}>
            <AgendaNovoPage />
          </RoleRoute>
        }
      />

      {/* WhatsApp pending: ADMIN and RECEPCAO only */}
      <Route
        path="/whatsapp"
        element={
          <RoleRoute allow={['ADMIN', 'RECEPCAO']}>
            <WhatsappPendentesPage />
          </RoleRoute>
        }
      />

      {/* Reports: ADMIN and RECEPCAO only */}
      <Route
        path="/relatorios"
        element={
          <RoleRoute allow={['ADMIN', 'RECEPCAO']}>
            <RelatoriosPage />
          </RoleRoute>
        }
      />

      {/* TV panel: public via TV_SECRET (no JWT), keep PrivateRoute as fallback */}
      <Route
        path="/painel-tv"
        element={<PrivateRoute><PainelTVPage /></PrivateRoute>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 3: TypeScript build check**

```bash
npm --workspace frontend run build 2>&1 | tail -10
```

Expected: no type errors.

---

## Task 5: Fix Docker Healthcheck + TV_SECRET Validation + Refresh Expiry Config

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/src/config/configuration.ts`
- Modify: `backend/src/auth/auth.service.ts`

### 5a: Docker healthcheck → /ready

- [ ] **Step 1: Update docker-compose.yml healthcheck**

In `docker-compose.yml`, change the `api` service healthcheck:

```yaml
# change from:
test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
# to:
test: ["CMD", "wget", "-qO-", "http://localhost:3000/ready"]
```

### 5b: Add TV_SECRET to required env validation

- [ ] **Step 2: Add TV_SECRET to validateEnv required list**

In `backend/src/config/configuration.ts`, update `validateEnv`:

```typescript
export function validateEnv(config: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGIN',
    'BOT_SECRET',
    'TV_SECRET',
  ];
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
  if (typeof config.TV_SECRET === 'string' && config.TV_SECRET.length < 16) {
    throw new Error('TV_SECRET deve ter pelo menos 16 caracteres');
  }
  return config;
}
```

### 5c: Fix hardcoded SEVEN_DAYS_MS in auth.service.ts

- [ ] **Step 3: Add `parseDurationMs` helper and replace hardcoded values**

In `backend/src/auth/auth.service.ts`, add helper after imports:

```typescript
/** Parse JWT duration string ('7d', '15m', '1h') to milliseconds */
function parseDurationMs(duration: string): number {
  const num = parseInt(duration, 10);
  if (duration.endsWith('d')) return num * 24 * 60 * 60 * 1000;
  if (duration.endsWith('h')) return num * 60 * 60 * 1000;
  if (duration.endsWith('m')) return num * 60 * 1000;
  if (duration.endsWith('s')) return num * 1000;
  return num; // assume ms if no suffix
}
```

Then replace both occurrences of `SEVEN_DAYS_MS` in `generateTokenPair()` and in the `$transaction` block of `refresh()`:

```typescript
// In generateTokenPair() — replace lines 69-70:
const refreshExpiresInMs = parseDurationMs(refreshExpiresIn);
const expiresAt = new Date(Date.now() + refreshExpiresInMs);

// In refresh() $transaction — replace lines 307-308:
const refreshExpiresInMs = parseDurationMs(refreshExpiresIn);
const newExpiresAt = new Date(Date.now() + refreshExpiresInMs);
```

- [ ] **Step 4: Compile check**

```bash
npm --workspace backend run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

---

## Task 6: Audit 403s in RolesGuard

**Files:**
- Modify: `backend/src/common/guards/roles.guard.ts`
- Modify: `backend/src/app.module.ts` (to inject AuditModule into APP_GUARD provider context — verify it's already global)

**Rule:** Every `ForbiddenException` from `RolesGuard` must be recorded in `auditoria` with `resultado: NEGADO`.

- [ ] **Step 1: Check AuditModule is globally available**

Read `backend/src/app.module.ts` — `AuditModule` must be imported (it is — confirmed in audit). `AuditService` is `@Injectable()` inside `AuditModule`. If `AuditModule` exports `AuditService`, it can be injected into guards.

Check `backend/src/audit/audit.module.ts`:

```bash
cat backend/src/audit/audit.module.ts
```

Expected: `exports: [AuditService]`. If not present, add it.

- [ ] **Step 2: Update RolesGuard to inject and use AuditService**

Replace `backend/src/common/guards/roles.guard.ts`:

```typescript
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
      const traceId = req.trace_id ?? 'unknown';
      const ip: string =
        req.header?.('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.ip ??
        'unknown';

      // Fire-and-forget audit log — do not block the guard throw
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
          // Audit failure must never block the guard response
        });

      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Perfil sem permissão para esta operação',
      });
    }

    return true;
  }
}
```

Note: `canActivate` return type changes to `Promise<boolean>` but NestJS accepts both sync and async guards.

- [ ] **Step 3: Compile check**

```bash
npm --workspace backend run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

---

## Task 7: Tests — /health, /ready, Agenda Ownership, Patient Data Restriction

**Files:**
- Create: `backend/test/health.e2e-spec.ts`
- Modify: `backend/test/agenda.e2e-spec.ts` (add ownership violation tests)
- Modify: `backend/test/pacientes.e2e-spec.ts` (add data restriction test)

### 7a: Health/Ready E2E tests

- [ ] **Step 1: Create health.e2e-spec.ts**

Create `backend/test/health.e2e-spec.ts`:

```typescript
/**
 * Health/Ready E2E
 *
 * Cobre:
 *  - GET /health — 200 sem autenticação, retorna { status: 'ok' }
 *  - GET /ready  — 200 quando DB up, retorna { status: 'ok' }
 *
 * Nota: /ready retorna 503 quando DB inacessível. Esse caso não é testado
 * aqui (depende de banco offline) mas está documentado via spec do terminus.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready → 200 when DB is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health → 200 even with Authorization header (public)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run health tests**

```bash
npm --workspace backend run test:e2e -- --testPathPattern=health 2>&1 | tail -20
```

Expected: 3 passing tests.

### 7b: Agenda ownership violation tests

- [ ] **Step 3: Add ownership violation describe block to agenda.e2e-spec.ts**

In `backend/test/agenda.e2e-spec.ts`, inside the main `describe('Agenda (e2e)')` block, add after existing test blocks:

```typescript
describe('Ownership enforcement (MEDICO/PROFISSIONAL_NAO_MEDICO)', () => {
  let agendamentoOutroMedicoId: string;

  beforeAll(async () => {
    // Create a second médico user (different from existing tokenMedico)
    const emailOutroMedico = uniqueEmail('outro-medico');
    const hashOutro = await argon2.hash('Senha@2026!');
    const usuarioOutroMedico = await prisma.usuario.create({
      data: {
        email: emailOutroMedico,
        senhaHash: hashOutro,
        nomeCompleto: 'Outro Médico Ownership',
        perfil: PerfilTipo.MEDICO,
        ativo: true,
      },
    });
    const profOutroMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Outro Médico Ownership',
        ehMedico: true,
        ativo: true,
        usuarioId: usuarioOutroMedico.id,
      },
    });

    // Create appointment for outroMedico's profissional
    const future = new Date(Date.now() + 72 * 3_600_000);
    const end = new Date(future.getTime() + 30 * 60_000);
    const ag = await prisma.agendamento.create({
      data: {
        pacienteId: pacienteId,
        profissionalId: profOutroMedico.id,
        dataHoraInicio: future,
        dataHoraFim: end,
        status: AgendamentoStatus.CONFIRMADO,
        origem: 'RECEPCAO',
        criadoPor: usuarioOutroMedico.id,
        atualizadoPor: usuarioOutroMedico.id,
      },
    });
    agendamentoOutroMedicoId = ag.id;
  });

  it('MEDICO cannot GET appointment belonging to another profissional (403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/agendamentos/${agendamentoOutroMedicoId}`)
      .set('Authorization', `Bearer ${tokenMedico}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PROFISSIONAL_NAO_MEDICO cannot GET appointment of another profissional (403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/agendamentos/${agendamentoOutroMedicoId}`)
      .set('Authorization', `Bearer ${tokenProfissional}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('MEDICO GET /agendamentos always filtered to own profissionalId (never sees others)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenMedico}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(200);
    const ids: string[] = res.body.data.map((a: any) => a.id);
    expect(ids).not.toContain(agendamentoOutroMedicoId);
  });

  it('MEDICO cannot call /chamar on another profissional appointment (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/agendamentos/${agendamentoOutroMedicoId}/chamar`)
      .set('Authorization', `Bearer ${tokenMedico}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(403);
  });

  it('ADMIN can GET any appointment', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/agendamentos/${agendamentoOutroMedicoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(agendamentoOutroMedicoId);
  });
});
```

- [ ] **Step 4: Run agenda ownership tests**

```bash
npm --workspace backend run test:e2e -- --testPathPattern=agenda 2>&1 | tail -30
```

Expected: all existing tests pass + new ownership tests pass.

### 7c: Patient data restriction tests

- [ ] **Step 5: Add data restriction test to pacientes.e2e-spec.ts**

In `backend/test/pacientes.e2e-spec.ts`, add inside the main describe block:

```typescript
describe('PROFISSIONAL_NAO_MEDICO data restriction', () => {
  const CPF_RESTRICTION = '99988877700';
  let pacienteRestricaoId: string;

  beforeAll(async () => {
    const p = await prisma.paciente.create({
      data: {
        cpf: CPF_RESTRICTION,
        nomeCompleto: 'Paciente Restricao Teste',
        dataNascimento: new Date('1990-01-01'),
        telefoneWhatsapp: '66999000111',
        observacoes: 'DADO SENSIVEL — não deve aparecer para prof não médico',
        responsavelNome: 'Responsável Teste',
        responsavelCpf: '12345678901',
      },
    });
    pacienteRestricaoId = p.id;
  });

  afterAll(async () => {
    await prisma.paciente.deleteMany({ where: { cpf: CPF_RESTRICTION } });
  });

  it('PROFISSIONAL_NAO_MEDICO receives only basic fields — no observacoes, responsavelCpf, endereco', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteRestricaoId}`)
      .set('Authorization', `Bearer ${tokenProfissional}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.id).toBeDefined();
    expect(d.nomeCompleto).toBeDefined();
    // Sensitive fields must be absent
    expect(d.observacoes).toBeUndefined();
    expect(d.responsavelNome).toBeUndefined();
    expect(d.responsavelCpf).toBeUndefined();
    expect(d.endereco).toBeUndefined();
  });

  it('MEDICO receives full patient data including observacoes', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteRestricaoId}`)
      .set('Authorization', `Bearer ${tokenMedico}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.observacoes).toBeDefined();
  });

  it('ADMIN receives full patient data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteRestricaoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('x-forwarded-for', uniqueIp());
    expect(res.status).toBe(200);
    expect(res.body.data.observacoes).toBeDefined();
  });
});
```

**Note:** These tests require `tokenProfissional` and `tokenMedico` variables to exist in the test file's scope. Check the existing `beforeAll` block in `pacientes.e2e-spec.ts` to verify they are created; if not, add the same user+login setup as in `agenda.e2e-spec.ts`.

- [ ] **Step 6: Run pacientes tests**

```bash
npm --workspace backend run test:e2e -- --testPathPattern=pacientes 2>&1 | tail -30
```

Expected: all existing tests pass + new restriction tests pass.

---

## Task 8: Final Verification

- [ ] **Step 1: Run all backend unit tests**

```bash
npm --workspace backend test 2>&1 | tail -20
```

Expected: all passing (or same count as before + new tests).

- [ ] **Step 2: Run all backend e2e tests serially**

```bash
npm --workspace backend run test:e2e 2>&1 | tail -30
```

Expected: all passing.

- [ ] **Step 3: TypeScript build frontend**

```bash
npm --workspace frontend run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Frontend lint**

```bash
npm --workspace frontend run lint 2>&1 | tail -10
```

Expected: 0 warnings.

- [ ] **Step 5: Backend lint**

```bash
npm --workspace backend run lint 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 6: Commit all changes**

```bash
git add backend/src/agenda/agenda.service.ts \
        backend/src/agenda/agenda.controller.ts \
        backend/src/pacientes/pacientes.service.ts \
        backend/src/pacientes/pacientes.controller.ts \
        frontend/src/store/auth.ts \
        frontend/src/api/auth.ts \
        frontend/src/api/client.ts \
        frontend/src/pages/LoginPage.tsx \
        frontend/src/components/RoleRoute.tsx \
        frontend/src/App.tsx \
        docker-compose.yml \
        backend/src/config/configuration.ts \
        backend/src/auth/auth.service.ts \
        backend/src/common/guards/roles.guard.ts \
        backend/test/health.e2e-spec.ts \
        backend/test/agenda.e2e-spec.ts \
        backend/test/pacientes.e2e-spec.ts
git commit -m "fix(security): auth/rbac/refresh hardening — ownership, data restriction, refresh token, audit 403"
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `backend/src/agenda/agenda.service.ts` | Add `assertOwnership()`, update `findAll()` signature, add `findOneForCaller()` |
| `backend/src/agenda/agenda.controller.ts` | Pass user context to `findAll`, `findOne`, `chamar`, `atendido` |
| `backend/src/pacientes/pacientes.service.ts` | Add `CAMPOS_BASICOS`, update `findOne(id, perfil?)` |
| `backend/src/pacientes/pacientes.controller.ts` | Pass `user.perfil` to `findOne()` |
| `frontend/src/store/auth.ts` | Add `refreshToken`, `updateTokens()` |
| `frontend/src/api/auth.ts` | Expose `refreshTokens()`, include `refresh_token` in login return |
| `frontend/src/api/client.ts` | Implement refresh interceptor with queue and retry |
| `frontend/src/pages/LoginPage.tsx` | Pass `refresh_token` to `setSession()` |
| `frontend/src/components/RoleRoute.tsx` | New — role-based route guard component |
| `frontend/src/App.tsx` | Apply `RoleRoute` to sensitive routes |
| `docker-compose.yml` | Change healthcheck to `/ready` |
| `backend/src/config/configuration.ts` | Add `TV_SECRET` to required, add length check |
| `backend/src/auth/auth.service.ts` | Add `parseDurationMs()`, replace hardcoded `SEVEN_DAYS_MS` |
| `backend/src/common/guards/roles.guard.ts` | Inject `AuditService`, log `NEGADO` on 403 |
| `backend/test/health.e2e-spec.ts` | New — `/health` and `/ready` tests |
| `backend/test/agenda.e2e-spec.ts` | Add ownership violation suite |
| `backend/test/pacientes.e2e-spec.ts` | Add data restriction suite |

## Remaining Risks After This Plan

1. **Frontend tests**: Only one Vitest test file exists (`clinic-date.test.ts`). The refresh interceptor and `RoleRoute` have no unit tests. Risk: medium — covered by e2e at backend level, but frontend logic untested.
2. **Logout does not clear refreshToken via API in current `logout()` call in frontend**: The `logout()` in `auth.ts` API module calls `POST /auth/logout` — it should send the `refreshToken` so the backend revokes it. Update `logout()` call sites to pass the stored refreshToken.
3. **TV panel route**: `/painel-tv` still uses `PrivateRoute` (JWT required). The actual TV endpoint in backend uses `TvAuthGuard` (header-based). These are separate concerns — if frontend TV page also needs to authenticate differently, that's out of scope of this plan.
4. **AuditModule exports**: If `audit.module.ts` doesn't export `AuditService`, the `RolesGuard` injection will fail at runtime. Must verify in Step 6.1.
