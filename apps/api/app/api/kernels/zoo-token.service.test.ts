import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { ZooTokenService } from '#api/kernels/zoo-token.service.js';

const service = (secret: string): ZooTokenService =>
  new ZooTokenService({ get: () => secret } as unknown as ConfigService<Environment, true>);

/** Milliseconds. */
const issuedAt = Date.parse('2026-10-11T00:00:00.000Z');

describe('ZooTokenService', () => {
  it('mints a token that names its user until it expires thirty minutes later', () => {
    const tokens = service('secret-a');
    const { token, expiresAt } = tokens.mint('user-1', issuedAt);

    expect(token).toMatch(/^zt1\.[\w-]+\.[\w-]+$/u);
    expect(expiresAt).toBe('2026-10-11T00:30:00.000Z');
    expect(tokens.verify(token, issuedAt + 29 * 60_000)).toBe('user-1');
    expect(tokens.verify(token, issuedAt + 30 * 60_000)).toBeUndefined();
  });

  it('refuses a token minted under another secret', () => {
    const { token } = service('secret-a').mint('user-1', issuedAt);

    expect(service('secret-b').verify(token, issuedAt)).toBeUndefined();
  });

  it('refuses a token whose claims were rewritten', () => {
    const { token } = service('secret-a').mint('user-1', issuedAt);
    const [prefix, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'user-2', iat: issuedAt / 1000, exp: issuedAt / 1000 + 1800 }),
    ).toString('base64url');

    expect(service('secret-a').verify(`${prefix}.${forged}.${signature}`, issuedAt)).toBeUndefined();
  });

  it.each([
    ['empty', ''],
    ['a session token', 'abc123.def456'],
    ['the wrong prefix', 'zt0.e30.AAAA'],
    ['undecodable claims', 'zt1.%%%.AAAA'],
    ['too many parts', 'zt1.a.b.c'],
  ])('refuses %s', (_label, token) => {
    expect(service('secret-a').verify(token, issuedAt)).toBeUndefined();
  });
});
