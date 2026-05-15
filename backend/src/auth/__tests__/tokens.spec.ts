/**
 * Unit tests — JWT access/refresh sign + verify
 *
 * Covers:
 *  - access token signed with jwt.secret verifies
 *  - refresh token signed with jwt.refreshSecret verifies
 *  - access token does NOT verify with refreshSecret (key separation)
 *  - expired refresh token fails verifyAsync
 *  - payload contains correct `sub`
 *  - SHA-256 hashToken helper: deterministic, diverges for different inputs, 64-char hex
 */

import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

// ─── constants ─────────────────────────────────────────────────────────────────
const JWT_SECRET = 'access-secret-min-32-chars-xxxxxxxxxxx';
const JWT_REFRESH_SECRET = 'refresh-secret-min-32-chars-xxxxxxxxxx';
const USER_ID = 'user-uuid-1234';

// ─── helper mirroring AuthService.hashToken (private method) ──────────────────
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── JWT helpers ───────────────────────────────────────────────────────────────
function makeAccessJwt(): JwtService {
  return new JwtService({
    secret: JWT_SECRET,
    signOptions: { expiresIn: '15m' },
  });
}

function makeRefreshJwt(): JwtService {
  return new JwtService({
    secret: JWT_REFRESH_SECRET,
    signOptions: { expiresIn: '7d' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('JWT — access token', () => {
  let accessJwt: JwtService;

  beforeEach(() => {
    accessJwt = makeAccessJwt();
  });

  it('signs and verifies with jwt.secret', async () => {
    const token = await accessJwt.signAsync({
      sub: USER_ID,
      email: 'user@test.com',
      perfil: 'ADMIN',
    });
    const payload = await accessJwt.verifyAsync<{ sub: string }>(token, {
      secret: JWT_SECRET,
    });
    expect(payload.sub).toBe(USER_ID);
  });

  it('payload contains correct sub', async () => {
    const token = await accessJwt.signAsync({
      sub: USER_ID,
      perfil: 'RECEPCAO',
    });
    const decoded = accessJwt.decode(token) as Record<string, unknown>;
    expect(decoded['sub']).toBe(USER_ID);
    expect(decoded['perfil']).toBe('RECEPCAO');
  });

  it('does NOT verify with refreshSecret (key separation)', async () => {
    const token = await accessJwt.signAsync({ sub: USER_ID });
    await expect(
      accessJwt.verifyAsync(token, { secret: JWT_REFRESH_SECRET }),
    ).rejects.toThrow();
  });
});

describe('JWT — refresh token', () => {
  let refreshJwt: JwtService;

  beforeEach(() => {
    refreshJwt = makeRefreshJwt();
  });

  it('signs and verifies with jwt.refreshSecret', async () => {
    const token = await refreshJwt.signAsync({
      sub: USER_ID,
      jti: 'some-uuid',
    });
    const payload = await refreshJwt.verifyAsync<{ sub: string; jti: string }>(
      token,
      {
        secret: JWT_REFRESH_SECRET,
      },
    );
    expect(payload.sub).toBe(USER_ID);
    expect(payload.jti).toBe('some-uuid');
  });

  it('refresh token does NOT verify with access secret', async () => {
    const token = await refreshJwt.signAsync({ sub: USER_ID });
    await expect(
      refreshJwt.verifyAsync(token, { secret: JWT_SECRET }),
    ).rejects.toThrow();
  });

  it('expired refresh token fails verifyAsync', async () => {
    // Sign with 1-second expiry then verify after forcing expiry via negative nbf trick
    // Easiest: sign with expiresIn=-1 (already expired)
    const expiredToken = await refreshJwt.signAsync(
      { sub: USER_ID },
      { secret: JWT_REFRESH_SECRET, expiresIn: -1 },
    );
    await expect(
      refreshJwt.verifyAsync(expiredToken, { secret: JWT_REFRESH_SECRET }),
    ).rejects.toThrow(/expired/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('hashToken helper (SHA-256)', () => {
  it('is deterministic — same input produces same hash', () => {
    const raw = 'some-refresh-token-value';
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it('diverges for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('returns 64-character hex string', () => {
    const h = hashToken('any-value');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
