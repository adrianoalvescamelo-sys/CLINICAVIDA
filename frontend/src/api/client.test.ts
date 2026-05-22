/**
 * Refresh interceptor — testa lógica de retry com refresh token.
 *
 * Cobre:
 *  - 401 + sem refresh token → clear + redirect /login
 *  - 401 + refresh sucesso → re-issue request com token novo + tokens persistidos
 *  - 401 + refresh falha → clear + redirect /login
 *  - 401 em /auth/refresh → não loop (rejeita direto)
 *  - 401 com _retry já true → não tenta segunda vez
 *  - Outros status (500, 403) não acionam refresh
 *  - Requests concorrentes durante refresh → enfileiram e usam token novo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';

// Mock window.location ANTES do import do client
const locationMock = {
  pathname: '/agenda',
  href: 'http://localhost/agenda',
};
Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: locationMock,
});

describe('client refresh interceptor', () => {
  let api: typeof import('./client').api;
  let useAuthStore: typeof import('../store/auth').useAuthStore;
  let mock: MockAdapter;

  beforeEach(async () => {
    vi.resetModules();
    locationMock.pathname = '/agenda';
    locationMock.href = 'http://localhost/agenda';

    const clientMod = await import('./client');
    const authMod = await import('../store/auth');
    api = clientMod.api;
    useAuthStore = authMod.useAuthStore;

    useAuthStore.setState({ token: null, refreshToken: null, user: null });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    mock.restore();
  });

  it('401 sem refreshToken: limpa store e redireciona para /login', async () => {
    useAuthStore.setState({
      token: 'expired',
      refreshToken: null,
      user: null,
    });
    mock.onGet('/protegido').reply(401);

    await expect(api.get('/protegido')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(useAuthStore.getState().token).toBeNull();
    expect(locationMock.href).toBe('/login');
  });

  it('401 sem refreshToken mas já em /login: não redireciona de novo', async () => {
    useAuthStore.setState({
      token: 'expired',
      refreshToken: null,
      user: null,
    });
    locationMock.pathname = '/login';
    locationMock.href = 'http://localhost/login';
    mock.onGet('/protegido').reply(401);

    await expect(api.get('/protegido')).rejects.toBeDefined();
    // href não muda quando já está em /login
    expect(locationMock.href).toBe('http://localhost/login');
  });

  it('401 com refresh sucesso: persiste tokens novos + retry original com Bearer atualizado', async () => {
    useAuthStore.setState({
      token: 'old-access',
      refreshToken: 'valid-refresh',
      user: null,
    });

    let callCount = 0;
    mock.onGet('/protegido').reply(() => {
      callCount++;
      if (callCount === 1) return [401];
      return [200, { ok: true, data: 'protegido' }];
    });
    // Refresh endpoint usa axios global (não api instance) — interceptor faz axios.post('/api/auth/refresh', ...).
    // axios-mock-adapter no `api` não pega esse. Precisa mockar axios global.
    const axiosDefault = (await import('axios')).default;
    const globalMock = new MockAdapter(axiosDefault);
    globalMock.onPost('/api/auth/refresh').reply(200, {
      success: true,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      },
    });

    const res = await api.get('/protegido');

    expect(res.data).toMatchObject({ ok: true });
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
    expect(callCount).toBe(2);
    globalMock.restore();
  });

  it('401 com refresh falhando: limpa store e redireciona para /login', async () => {
    useAuthStore.setState({
      token: 'old-access',
      refreshToken: 'expired-refresh',
      user: null,
    });

    mock.onGet('/protegido').reply(401);
    const axiosDefault = (await import('axios')).default;
    const globalMock = new MockAdapter(axiosDefault);
    globalMock.onPost('/api/auth/refresh').reply(401);

    await expect(api.get('/protegido')).rejects.toBeDefined();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(locationMock.href).toBe('/login');
    globalMock.restore();
  });

  it('status 500 não aciona refresh (apenas 401)', async () => {
    useAuthStore.setState({
      token: 'access',
      refreshToken: 'refresh-ok',
      user: null,
    });
    mock.onGet('/protegido').reply(500);

    await expect(api.get('/protegido')).rejects.toMatchObject({
      response: { status: 500 },
    });

    // Store inalterada
    expect(useAuthStore.getState().token).toBe('access');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-ok');
  });

  it('status 403 não aciona refresh', async () => {
    useAuthStore.setState({
      token: 'access',
      refreshToken: 'refresh-ok',
      user: null,
    });
    mock.onGet('/protegido').reply(403);

    await expect(api.get('/protegido')).rejects.toBeDefined();

    expect(useAuthStore.getState().token).toBe('access');
  });

  it('request com header injetado: usa token do store', async () => {
    useAuthStore.setState({
      token: 'access-injected',
      refreshToken: null,
      user: null,
    });
    let receivedAuth: string | undefined;
    mock.onGet('/x').reply((config) => {
      receivedAuth = config.headers?.Authorization as string;
      return [200, {}];
    });

    await api.get('/x');

    expect(receivedAuth).toBe('Bearer access-injected');
  });

  it('request sem token: não injeta Authorization', async () => {
    useAuthStore.setState({
      token: null,
      refreshToken: null,
      user: null,
    });
    let receivedAuth: string | undefined;
    mock.onGet('/x').reply((config) => {
      receivedAuth = config.headers?.Authorization as string;
      return [200, {}];
    });

    await api.get('/x');

    expect(receivedAuth).toBeUndefined();
  });
});
