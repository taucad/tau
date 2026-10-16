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
  githubGistTransport,
  parseGithubGistAuthorizationReturn,
  withBrowserShareProviderContext,
} = await import('#lib/share-providers.js');

describe('GitHub Gist API transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window.ENV = {
      ...originalClientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- browser environment keys are uppercase by contract.
      TAU_API_URL: 'https://api.tau.test/',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 'connected',
          enabled: true,
          grantedScopes: ['gist'],
          authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('should send only the mutation intent to Tau with no OAuth token getter', async () => {
    const input: Parameters<typeof githubGistTransport.mutate>[0] = {
      action: 'create',
      payload: { public: false, files: { 'tau-project.zip.base64url': { content: 'archive' } } },
    };
    await githubGistTransport.mutate(input);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.tau.test/v1/github/gists/mutate',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify(input) }),
    );
    expect(authClient.getAccessToken).not.toHaveBeenCalled();
    expect(authClient.listAccounts).not.toHaveBeenCalled();
  });

  it('should derive Gist status from the API’s verified capability', async () => {
    for (const status of ['connected', 'permission-required', 'not-connected', 'disabled', 'reconnect-required']) {
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          status,
          enabled: true,
          grantedScopes: [],
          authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
        }),
      );
      // oxlint-disable-next-line no-await-in-loop -- verify each independent state.
      await expect(getGithubGistConnectionStatus()).resolves.toBe(status);
    }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
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

  /* D51: a link Better Auth refuses for a reason a retry cannot fix says which. */
  it('names the email mismatch and the account already linked elsewhere instead of asking for a retry', () => {
    const emailMismatch = parseGithubGistAuthorizationReturn('?shareAuth=github-gist&error=email_does_not_match');
    expect(emailMismatch).toMatchObject({ outcome: 'failed', remainingSearch: '' });
    expect(emailMismatch?.failure).toMatch(/different email address from your Tau account/u);
    const linkedElsewhere = parseGithubGistAuthorizationReturn(
      '?shareAuth=github-gist&error=account_already_linked_to_different_user',
    );
    expect(linkedElsewhere?.outcome).toBe('failed');
    expect(linkedElsewhere?.failure).toMatch(/already linked to another Tau account/u);
    expect(parseGithubGistAuthorizationReturn('?shareAuth=github-gist&error=state_mismatch')).toEqual({
      outcome: 'failed',
      remainingSearch: '',
    });
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
    const capability = (status: string) =>
      Response.json({
        status,
        enabled: true,
        grantedScopes: [],
        authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
      });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(capability('permission-required'))
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async () => capability('connected')),
    );

    const connected = awaitGithubGistConnection(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1999);
    expect(authClient.listAccounts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4001);

    await expect(connected).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should give up after ten minutes without the gist scope', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 'permission-required',
          enabled: true,
          grantedScopes: [],
          authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
        }),
      ),
    );

    const connected = awaitGithubGistConnection(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    await expect(connected).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(300);
  });

  it('should stop polling once the wait is cancelled', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
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
