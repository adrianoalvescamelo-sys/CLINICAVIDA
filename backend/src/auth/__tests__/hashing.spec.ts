/**
 * Unit tests — Argon2id hashing
 *
 * Covers:
 *  - hash + verify succeeds with correct password
 *  - verify fails with wrong password
 *  - hash format is argon2id ($argon2id$ prefix)
 *  - different hashes for same password (random salt)
 */

import * as argon2 from 'argon2';

describe('Argon2id hashing', () => {
  const PASSWORD = 'SuperSecretP@ssw0rd!';

  it('hash + verify: correct password returns true', async () => {
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const ok = await argon2.verify(hash, PASSWORD);
    expect(ok).toBe(true);
  });

  it('verify: wrong password returns false', async () => {
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const ok = await argon2.verify(hash, 'WrongPassword123!');
    expect(ok).toBe(false);
  });

  it('hash format starts with $argon2id$ (argon2id variant)', async () => {
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('same password produces different hashes (random salt)', async () => {
    const hash1 = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const hash2 = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    expect(hash1).not.toBe(hash2);
    // Both should still verify against the original password
    expect(await argon2.verify(hash1, PASSWORD)).toBe(true);
    expect(await argon2.verify(hash2, PASSWORD)).toBe(true);
  });

  it('empty string password hashes and verifies correctly', async () => {
    // Edge case: empty password should not throw, though it is insecure
    const hash = await argon2.hash('', { type: argon2.argon2id });
    expect(await argon2.verify(hash, '')).toBe(true);
    expect(await argon2.verify(hash, PASSWORD)).toBe(false);
  });
});
