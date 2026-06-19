// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildThemeCookieOptions } from '#sessions.server.js';

describe('buildThemeCookieOptions', () => {
  it.each([
    ['localhost HTTP', 'http://localhost:3000/action/set-theme'],
    ['loopback HTTP', 'http://127.0.0.1:3000/action/set-theme'],
  ])('should create host-only insecure theme cookies for %s requests', (_label, requestUrl) => {
    const options = buildThemeCookieOptions({ requestUrl });

    expect(options).toMatchObject({
      name: 'tau-theme',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secrets: ['s3cr3t'],
      secure: false,
    });
    expect(options).not.toHaveProperty('domain');
  });

  it.each([
    ['staging', 'https://taucad.dev/action/set-theme'],
    ['production', 'https://tau.new/action/set-theme'],
    ['preview', 'https://deploy-preview-123--taucad.netlify.app/action/set-theme'],
  ])('should create host-only secure theme cookies for %s HTTPS requests', (_label, requestUrl) => {
    const options = buildThemeCookieOptions({ requestUrl });

    expect(options).toMatchObject({
      name: 'tau-theme',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secrets: ['s3cr3t'],
      secure: true,
    });
    expect(options).not.toHaveProperty('domain');
  });
});
