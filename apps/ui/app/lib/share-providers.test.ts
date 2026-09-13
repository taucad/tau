import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* `linkSocial` is typed by its one argument so the scope assertions below read
 * the call's own shape rather than `any` — the *order* of the two consents is
 * what those rows are for (charter W12). */
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
  authorizeGithubRemote,
  connectGithubGist,
  githubRemoteAuthorization,
  githubRemoteScope,
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

/*
 * Connecting a project to a GitHub repository (charter W12, S34).
 *
 * The rule the charter states is an *order*, not a set: `public_repo` when
 * Connect is pressed, and `repo` only once the person has said the repository
 * is private. Asking for `repo` up front would be a pre-emptive grant of read
 * and write over every private repository the person has.
 */
describe('GitHub remote authority', () => {
  const consentWindow = (): Window => ({ closed: false, close: vi.fn(), location: { href: '' } }) as unknown as Window;

  beforeEach(() => {
    vi.clearAllMocks();
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'account_1', scopes: ['read:user'] }],
      error: null,
    });
    authClient.linkSocial.mockResolvedValue({ data: { url: 'https://github.com/login/oauth/authorize' }, error: null });
  });

  it('names the one scope each visibility needs', () => {
    expect(githubRemoteScope('public')).toBe('public_repo');
    expect(githubRemoteScope('private')).toBe('repo');
  });

  it('asks for public_repo first and repo only after the private choice', async () => {
    const consent = consentWindow();
    /* Each poll answers with the scope just granted, so the consent window is
     * the only thing being scripted here — the order is what is under test. */
    authClient.listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: 'github', accountId: 'a', scopes: ['read:user'] }], error: null })
      .mockResolvedValueOnce({ data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }], error: null })
      .mockResolvedValueOnce({ data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }], error: null })
      .mockResolvedValue({
        data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo', 'repo'] }],
        error: null,
      });

    await authorizeGithubRemote({ visibility: 'private', consent });

    expect(authClient.linkSocial.mock.calls.map(([call]) => call.scopes)).toStrictEqual([['public_repo'], ['repo']]);
    expect(authClient.linkSocial.mock.calls.every(([call]) => call.disableRedirect === true)).toBe(true);
  });

  it('asks for nothing more than public_repo for a public repository', async () => {
    const consent = consentWindow();
    authClient.listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: 'github', accountId: 'a', scopes: ['read:user'] }], error: null })
      .mockResolvedValue({ data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }], error: null });

    await authorizeGithubRemote({ visibility: 'public', consent });

    expect(authClient.linkSocial.mock.calls.map(([call]) => call.scopes)).toStrictEqual([['public_repo']]);
  });

  it('asks for nothing at all when the session already carries the scope', async () => {
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }],
      error: null,
    });

    await authorizeGithubRemote({ visibility: 'public', consent: consentWindow() });

    expect(authClient.linkSocial).not.toHaveBeenCalled();
  });

  it('asks again on a reconnect, because a rotated secret leaves the scope and loses the token', async () => {
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }],
      error: null,
    });

    await authorizeGithubRemote({ visibility: 'public', consent: consentWindow(), reconnect: true });

    expect(authClient.linkSocial.mock.calls.map(([call]) => call.scopes)).toStrictEqual([['public_repo']]);
  });

  /*
   * Review R4: a project connected to a *private* repository must get `repo`
   * back. Nothing records which project was private — the row survives a reload
   * — so the account's own widest scope is what the reconnect re-grants.
   */
  it('re-grants `repo` on a reconnect for an account that records it, never a silent downgrade', async () => {
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo', 'repo'] }],
      error: null,
    });

    await authorizeGithubRemote({ visibility: 'public', consent: consentWindow(), reconnect: true });

    expect(authClient.linkSocial.mock.calls.map(([call]) => call.scopes)).toStrictEqual([['repo']]);
  });

  it('closes the consent window even when nothing had to be asked for', async () => {
    const consent = { closed: false, close: vi.fn(), location: { href: '' } } as unknown as Window;
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'a', scopes: ['public_repo'] }],
      error: null,
    });

    await authorizeGithubRemote({ visibility: 'public', consent });

    expect(authClient.linkSocial).not.toHaveBeenCalled();
    // An `about:blank` pop-up left open is the user-visible defect (review R5).
    expect(consent.close).toHaveBeenCalled();
  });

  it('says the permission was not granted when the window is closed without it', async () => {
    const consent = { closed: true, close: vi.fn(), location: { href: '' } } as unknown as Window;

    await expect(authorizeGithubRemote({ visibility: 'public', consent })).rejects.toThrow(
      'GitHub permission was not granted.',
    );
  });

  it('mints the remote credential as a header value, through the broker’s allow-set', async () => {
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'github', accountId: 'account_1', scopes: ['public_repo'] }],
      error: null,
    });
    authClient.getAccessToken.mockResolvedValue({
      data: { accessToken: 'gho_remote', scopes: ['public_repo'] },
      error: null,
    });

    await expect(githubRemoteAuthorization('public')).resolves.toBe('Bearer gho_remote');
  });

  it('refuses an authority that is not on the allow-set', async () => {
    await expect(
      githubShareCredentialBroker.getAccessToken({
        connectionId: 'github',
        audience: 'https://api.github.com',
        scopes: ['delete_repo'],
      }),
    ).rejects.toThrow('The requested GitHub authority is not allowed.');
  });
});
