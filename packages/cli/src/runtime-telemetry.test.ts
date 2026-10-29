/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authTokenReader } from '#runtime-telemetry.js';

const keys = vi.hoisted(() => ({ getPassword: vi.fn(), constructor: vi.fn() }));
vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    public getPassword = keys.getPassword;
    public constructor(...args: unknown[]) {
      keys.constructor(...args);
    }
  },
}));
afterEach(() => {
  vi.clearAllMocks();
});

describe('authTokenReader', () => {
  it('should read the environment token first without opening the OS store', async () => {
    await expect(authTokenReader('https://api.example.test', { TAU_AUTH_TOKEN: 'injected' })()).resolves.toEqual({
      kind: 'token',
      token: 'injected',
    });
    expect(keys.constructor).not.toHaveBeenCalled();
  });
  it('should read the saved session, or none when there is no saved session', async () => {
    keys.getPassword.mockResolvedValueOnce('saved').mockResolvedValueOnce(null);
    const read = authTokenReader('https://api.example.test', {});
    await expect(read()).resolves.toEqual({ kind: 'token', token: 'saved' });
    await expect(read()).resolves.toEqual({ kind: 'none' });
  });
  it('should never reject: a locked credential store is unavailable', async () => {
    keys.getPassword.mockRejectedValue(new Error('locked'));
    await expect(authTokenReader('https://api.example.test', {})()).resolves.toEqual({ kind: 'unavailable' });
  });
});
