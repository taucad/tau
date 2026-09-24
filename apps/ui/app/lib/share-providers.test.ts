import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LinkSocialInput = Readonly<{ scopes: readonly string[]; disableRedirect?: boolean }>;

const authClient = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccessToken: vi.fn(),
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- the endpoint answers a different shape per surface.
  linkSocial: vi.fn<(input: LinkSocialInput) => Promise<any>>(),
}));
const artifactCodec = vi.hoisted(() => ({
  dispose: vi.fn(),
}));
const originalClientEnvironment = globalThis.window.ENV;

vi.mock('#lib/auth-client.js', () => ({ authClient }));
vi.mock('@taucad/share/artifact-worker', () => ({
  createShareArtifactWorkerCodec: vi.fn(() => artifactCodec),
}));

const {
  awaitGithubGistConnection,
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
    globalThis.window.ENV = {
      ...originalClientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- browser environment keys are uppercase by contract.
      TAU_API_URL: 'https://api.tau.test/',
    };
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'account_1', scopes: ['read:user', 'gist'] }],
      error: null,
    });
    authClient.getAccessToken.mockResolvedValue({
      data: { accessToken: 'one-operation-token', scopes: ['gist'] },
      error: null,
    });
  });

  afterEach(() => {
    globalThis.window.ENV = originalClientEnvironment;
  });

  it('owns the artifact worker for exactly one operation', async () => {
    await expect(
      withBrowserShareProviderContext(async (context) => {
        expect(context.archiveUrl).toBe('https://api.tau.test/v1/repositories/archive');
        return 'complete';
      }),
    ).resolves.toBe('complete');
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

  it('should refuse repository scopes, which only the GitHub App connection grants', async () => {
    for (const scope of ['public_repo', 'repo', 'delete_repo']) {
      // oxlint-disable-next-line no-await-in-loop -- each refusal is asserted in turn.
      await expect(
        githubShareCredentialBroker.getAccessToken({
          connectionId: 'github',
          audience: 'https://api.github.com',
          scopes: [scope],
        }),
      ).rejects.toThrow('The requested GitHub authority is not allowed.');
    }
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

    await expect(
      connectGithubGist({
        returnUrl: 'https://tau.new/w/home/demo?chat=chat_1#password=secret',
        surface: 'editor',
      }),
    ).resolves.toBe('redirect');

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

/* D16c: on desktop the OAuth `state` cookie and the GitHub callback would live
 * in two different browsers, so the grant runs on the web page instead. */
describe('desktop GitHub Gist consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...originalClientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new/',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    globalThis.window.ENV = originalClientEnvironment;
  });

  it('should open the web consent page in the system browser and never link from the renderer', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    await expect(connectGithubGist({ returnUrl: 'app://tau/w/home/demo', surface: 'editor' })).resolves.toBe(
      'system-browser',
    );

    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://tau.new/connect/github-gist',
      '_blank',
      'noopener,noreferrer',
    );
    expect(authClient.linkSocial).not.toHaveBeenCalled();
  });

  it('should poll every two seconds until the account carries the gist scope', async () => {
    vi.useFakeTimers();
    authClient.listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: 'github', accountId: 'a', scopes: ['read:user'] }], error: null })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: [{ providerId: 'github', accountId: 'a', scopes: ['gist'] }], error: null });

    const connected = awaitGithubGistConnection(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1999);
    expect(authClient.listAccounts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4001);

    await expect(connected).resolves.toBe(true);
    expect(authClient.listAccounts).toHaveBeenCalledTimes(3);
  });

  it('should give up after ten minutes without the gist scope', async () => {
    vi.useFakeTimers();
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'a', scopes: ['read:user'] }],
      error: null,
    });

    const connected = awaitGithubGistConnection(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    await expect(connected).resolves.toBe(false);
    expect(authClient.listAccounts).toHaveBeenCalledTimes(300);
  });

  it('should stop polling once the wait is cancelled', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();

    const connected = awaitGithubGistConnection(controller.signal);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(connected).resolves.toBe(false);
    expect(authClient.listAccounts).not.toHaveBeenCalled();
  });
});

describe('browser share provider origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.window.ENV = originalClientEnvironment;
  });

  it('should build share links from the document origin on the web', async () => {
    await withBrowserShareProviderContext(async (context) => {
      expect(context.origin).toBe(globalThis.location.origin);
    });
  });

  it('should build share links from the web origin on desktop, not from app://tau', async () => {
    /* `formatShareUrl` derives every direct and gist link from this origin, and
       `/s/*` is not even routed in the desktop SPA
       (`docs/research/desktop-share-links-blueprint.md`, L2). */
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...originalClientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new',
    };

    await withBrowserShareProviderContext(async (context) => {
      expect(context.origin).toBe('https://tau.new');
    });
  });
});
