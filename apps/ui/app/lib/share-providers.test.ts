import { beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccessToken: vi.fn(),
  linkSocial: vi.fn(),
}));
const artifactCodec = vi.hoisted(() => ({
  dispose: vi.fn(),
}));

vi.mock('#lib/auth-client.js', () => ({ authClient }));
vi.mock('@taucad/share/artifact-worker', () => ({
  createShareArtifactWorkerCodec: vi.fn(() => artifactCodec),
}));

const {
  connectGithubGist,
  createGithubGistAuthorizationReturnUrl,
  getGithubGistConnectionStatus,
  githubShareCredentialBroker,
  parseGithubGistAuthorizationReturn,
  withBrowserShareProviderContext,
} = await import('#lib/share-providers.js');

describe('GitHub share credential broker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'account_1', scopes: ['read:user', 'gist'] }],
      error: null,
    });
    authClient.getAccessToken.mockResolvedValue({
      data: { accessToken: 'one-operation-token', scopes: ['gist'] },
      error: null,
    });
  });

  it('owns the artifact worker for exactly one operation', async () => {
    await expect(withBrowserShareProviderContext(async () => 'complete')).resolves.toBe('complete');
    expect(artifactCodec.dispose).toHaveBeenCalledOnce();

    await expect(
      withBrowserShareProviderContext(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(artifactCodec.dispose).toHaveBeenCalledTimes(2);
  });

  it('leases one gist-scoped token only for the GitHub API audience', async () => {
    await expect(
      githubShareCredentialBroker.getAccessToken({
        connectionId: 'github',
        audience: 'https://api.github.com',
        scopes: ['gist'],
      }),
    ).resolves.toEqual({ accessToken: 'one-operation-token', grantedScopes: ['gist'] });
    expect(authClient.getAccessToken).toHaveBeenCalledOnce();
    expect(authClient.getAccessToken).toHaveBeenCalledWith({
      providerId: 'github',
      accountId: 'account_1',
    });
  });

  it('rejects broader authorities before requesting a token', async () => {
    await expect(
      githubShareCredentialBroker.getAccessToken({
        connectionId: 'github',
        audience: 'https://example.com',
        scopes: ['gist'],
      }),
    ).rejects.toMatchObject({ code: 'SHARE_PERMISSION_REQUIRED' });
    expect(authClient.listAccounts).not.toHaveBeenCalled();
    expect(authClient.getAccessToken).not.toHaveBeenCalled();
  });

  it('requires the actual gist scope on a linked GitHub account', async () => {
    await expect(getGithubGistConnectionStatus()).resolves.toBe('connected');
    authClient.listAccounts.mockResolvedValueOnce({
      data: [{ providerId: 'github', accountId: 'account_1', scopes: ['read:user'] }],
      error: null,
    });
    await expect(getGithubGistConnectionStatus()).resolves.toBe('permission-required');
    authClient.listAccounts.mockResolvedValueOnce({ data: [], error: null });
    await expect(getGithubGistConnectionStatus()).resolves.toBe('not-connected');
    authClient.listAccounts.mockResolvedValueOnce({ data: null, error: { message: 'unauthorized' } });
    await expect(getGithubGistConnectionStatus()).resolves.toBe('signed-out');
  });

  it('lets Better Auth own the incremental GitHub scope redirect without forwarding fragments', async () => {
    authClient.linkSocial.mockResolvedValueOnce({ data: {}, error: null });

    await connectGithubGist({
      returnUrl: 'https://tau.new/w/home/demo?chat=chat_1#password=secret',
      surface: 'editor',
    });

    expect(authClient.linkSocial).toHaveBeenCalledWith({
      provider: 'github',
      scopes: ['gist'],
      callbackURL:
        'https://tau.new/w/home/demo?chat=chat_1&shareAuth=github-gist&workbench=share&shareProvider=github-gist',
      errorCallbackURL:
        'https://tau.new/w/home/demo?chat=chat_1&shareAuth=github-gist&workbench=share&shareProvider=github-gist',
    });
  });

  it('marks shared-page returns without adding editor Workbench state', () => {
    expect(
      createGithubGistAuthorizationReturnUrl({
        returnUrl: 'https://tau.new/s/github-gist~abc?keep=1&workbench=share&shareProvider=github-gist#key=secret',
        surface: 'share-page',
      }),
    ).toBe('https://tau.new/s/github-gist~abc?keep=1&shareAuth=github-gist');
  });

  it('consumes only recognized GitHub authorization fields and never returns provider descriptions', () => {
    expect(
      parseGithubGistAuthorizationReturn(
        '?chat=chat_1&shareAuth=github-gist&error=access_denied&error_description=sensitive+provider+copy',
      ),
    ).toEqual({ outcome: 'cancelled', remainingSearch: '?chat=chat_1' });
    expect(parseGithubGistAuthorizationReturn('?chat=chat_1&error=access_denied')).toBeUndefined();
  });
});
