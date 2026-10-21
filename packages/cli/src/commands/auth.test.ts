import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deleteCredential: vi.fn(),
  deviceLogin: vi.fn(),
  inspectSession: vi.fn(),
  revokeSession: vi.fn(),
  resolveAuthToken: vi.fn(),
}));
const output = vi.hoisted(() => ({ emit: vi.fn(), writeStdout: vi.fn() }));
vi.mock('#auth.js', () => ({
  ...auth,
  authApiOrigin: () => 'https://api.example.test',
  credentialEntry: async () => auth,
}));
vi.mock('#auth-lock.js', () => ({ withAuthLock: async (_origin: string, run: () => Promise<void>) => run() }));
vi.mock('#commands/open.js', () => ({ launch: vi.fn() }));
vi.mock('#output.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...output,
}));
const { authCommand } = await import('#commands/auth.js');
const run = async (...rawArgs: string[]): Promise<unknown> => runCommand(authCommand, { rawArgs });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TAU_AUTH_TOKEN', '');
  auth.deviceLogin.mockResolvedValue('private-session');
});
afterEach(() => vi.unstubAllEnvs());

describe('CLI authentication lifecycle', () => {
  it('stores the separate session and emits no credential', async () => {
    await run('login', '--no-browser', '--json');
    expect(auth.setPassword).toHaveBeenCalledExactlyOnceWith('private-session');
    expect(JSON.stringify(output.emit.mock.calls)).not.toContain('private-session');
    expect(output.emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed-in' }));
  });
  it.each(['login', 'logout'])('refuses %s with an environment override', async (command) => {
    vi.stubEnv('TAU_AUTH_TOKEN', 'injected');
    await expect(run(command)).rejects.toMatchObject({ code: 'AUTH_ENV_OVERRIDE' });
    expect(auth.getPassword).not.toHaveBeenCalled();
    expect(auth.revokeSession).not.toHaveBeenCalled();
  });
  it('revokes a new session if credential saving fails', async () => {
    auth.setPassword.mockRejectedValue(new Error('store locked'));
    await expect(run('login', '--no-browser')).rejects.toMatchObject({ code: 'AUTH_STORE_UNAVAILABLE' });
    expect(auth.revokeSession).toHaveBeenCalledExactlyOnceWith('https://api.example.test', 'private-session');
    expect(output.emit).not.toHaveBeenCalled();
  });
  it('explains manual recovery when rollback cannot be confirmed', async () => {
    auth.setPassword.mockRejectedValue(new Error('store locked'));
    auth.revokeSession.mockRejectedValue(new Error('offline'));
    await expect(run('login', '--no-browser')).rejects.toMatchObject({
      code: 'AUTH_CLEANUP_REQUIRED',
    });
  });
  it('revokes a session when cancelled after redemption before storage', async () => {
    auth.deviceLogin.mockImplementation(async () => {
      process.emit('SIGINT');
      return 'private-session';
    });
    await expect(run('login', '--no-browser')).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(auth.revokeSession).toHaveBeenCalledTimes(1);
  });
  it('revokes and deletes when cancellation arrives during storage', async () => {
    auth.setPassword.mockImplementation(async () => {
      process.emit('SIGINT');
    });
    const initialListeners = process.listenerCount('SIGINT');
    await expect(run('login', '--no-browser')).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
    expect(auth.revokeSession).toHaveBeenCalledTimes(1);
    expect(auth.deleteCredential).toHaveBeenCalledTimes(1);
    expect(process.listenerCount('SIGINT')).toBe(initialListeners);
  });
  it('retains a saved session if logout cannot revoke it', async () => {
    auth.getPassword.mockResolvedValue('saved-session');
    auth.revokeSession.mockRejectedValue(new Error('offline'));
    await expect(run('logout')).rejects.toThrow('offline');
    expect(auth.deleteCredential).not.toHaveBeenCalled();
  });
  it('revokes before deleting on successful logout', async () => {
    auth.getPassword.mockResolvedValue('saved-session');
    await run('logout', '--json');
    expect(auth.revokeSession).toHaveBeenCalledExactlyOnceWith('https://api.example.test', 'saved-session');
    expect(auth.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
      auth.deleteCredential.mock.invocationCallOrder[0]!,
    );
  });
  it('checks status remotely and only reports account metadata', async () => {
    auth.resolveAuthToken.mockResolvedValue('saved-session');
    auth.inspectSession.mockResolvedValue({ user: { email: 'qa@example.test' }, session: { expiresAt: '2030-01-01' } });
    await run('status', '--json');
    expect(auth.inspectSession).toHaveBeenCalledWith('https://api.example.test', 'saved-session');
    expect(output.emit).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'qa@example.test', source: 'credential-store' }),
    );
    expect(JSON.stringify(output.emit.mock.calls)).not.toContain('saved-session');
  });
});
