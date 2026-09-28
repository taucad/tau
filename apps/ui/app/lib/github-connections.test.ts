import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubRequestError, githubConnections, githubErrorMessage, safeReturnPath } from '#lib/github-connections.js';

const token = { accessToken: 'test-access', expiresAt: '2026-09-23T12:00:00.000Z', generation: 1 };
const repository = {
  id: 30,
  name: 'part',
  fullName: 'octo/part',
  owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
  visibility: 'private',
  access: 'write',
  archived: false,
  disabled: false,
  description: null,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/octo/part',
  cloneUrl: 'https://github.com/octo/part.git',
};

const headersOf = (fetch: ReturnType<typeof vi.fn>): Headers => {
  const init = fetch.mock.lastCall?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
};

describe('githubConnections', () => {
  let fetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should send no content-type on bodiless token, remove and cancel requests', async () => {
    fetch.mockResolvedValueOnce(Response.json(token));
    await githubConnections.token('connection-1');
    expect(fetch.mock.lastCall?.[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(headersOf(fetch).has('content-type')).toBe(false);

    /* The API answers both deletes 204 with no body. */
    fetch.mockResolvedValueOnce(new Response(undefined, { status: 204 }));
    await expect(githubConnections.remove('connection-1')).resolves.toBeUndefined();
    expect(fetch.mock.lastCall?.[1]).toMatchObject({ method: 'DELETE' });
    expect(headersOf(fetch).has('content-type')).toBe(false);

    fetch.mockResolvedValueOnce(new Response(undefined, { status: 204 }));
    await expect(githubConnections.cancel('attempt-1')).resolves.toBeUndefined();
    expect(fetch.mock.lastCall?.[1]).toMatchObject({ method: 'DELETE' });
    expect(headersOf(fetch).has('content-type')).toBe(false);
  });

  it('should send a JSON content-type when a body is sent', async () => {
    fetch.mockResolvedValueOnce(
      Response.json({
        attemptId: '5c9b4a3e-3f5e-4a8e-9a55-7f7ad8f0a3a1',
        authorizationUrl: 'https://github.com/login',
      }),
    );
    await githubConnections.start('/import');
    expect(headersOf(fetch).get('content-type')).toBe('application/json');
  });

  it('should read one repository and one branch by exact name', async () => {
    fetch.mockResolvedValueOnce(Response.json(repository));
    await expect(githubConnections.repository('connection-1', 30)).resolves.toEqual(repository);
    expect(String(fetch.mock.lastCall?.[0])).toMatch(/\/v1\/github\/repositories\/30\?connectionId=connection-1$/u);

    const branch = { name: 'feature/deep', head: 'a'.repeat(40) };
    fetch.mockResolvedValueOnce(Response.json(branch));
    await expect(githubConnections.branch('connection-1', 30, 'feature/deep')).resolves.toEqual(branch);
    expect(String(fetch.mock.lastCall?.[0])).toMatch(
      /\/v1\/github\/repositories\/30\/branch\?connectionId=connection-1&name=feature%2Fdeep$/u,
    );
  });

  it('should throw a typed error whose message is a sentence, never the raw code', async () => {
    fetch.mockResolvedValueOnce(Response.json({ code: 'GITHUB_CONNECTION_UNAVAILABLE' }, { status: 503 }));
    const error: unknown = await githubConnections.configuration().catch((error: unknown) => error);

    expect(error).toBeInstanceOf(GithubRequestError);
    expect(error).toMatchObject({ status: 503, code: 'GITHUB_CONNECTION_UNAVAILABLE' });
    expect(githubErrorMessage(error)).toBe("GitHub connection isn't set up on this deployment.");
    expect(githubErrorMessage(error)).not.toContain('GITHUB_');
  });
});

describe('githubErrorMessage', () => {
  it('should fall back by status for an unknown code', () => {
    expect(githubErrorMessage(new GithubRequestError(429, 'SOMETHING_NEW'))).toMatch(/rate limit/u);
    expect(githubErrorMessage(new GithubRequestError(502, undefined))).toMatch(/unavailable right now/u);
  });

  it('should map a coded error from another layer and hide unknown messages', () => {
    expect(githubErrorMessage(Object.assign(new Error('raw'), { code: 'GIT_PROXY_UPSTREAM_FAILED' }))).toBe(
      "Tau couldn't reach the Git host. Try again shortly.",
    );
    expect(githubErrorMessage(new TypeError('Failed to fetch'))).toMatch(/couldn't reach its server/u);
    expect(githubErrorMessage(new Error('Not Found - https://docs.github.com'))).toBe(
      'The GitHub request failed. Try again.',
    );
  });
});

describe('githubErrorMessage prototype keys (R-U7)', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('should fall back for the code %s', (code) => {
    expect(githubErrorMessage({ code })).toBe('The GitHub request failed. Try again.');
    expect(new GithubRequestError(400, code).message).toBe('The GitHub request failed. Try again.');
  });
});

describe('safeReturnPath (R-U1)', () => {
  it.each([
    ['/import', '/import'],
    ['/w/home/p?tab=sync#remote', '/w/home/p?tab=sync#remote'],
    ['/a/../import', '/import'],
  ])('should keep the same-origin path %s', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });

  it.each([
    ['a tab', '/\t/evil.com'],
    ['a line feed', '/\n/evil.com'],
    ['a carriage return', '/\r/evil.com'],
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash host', String.raw`/\evil.com`],
    ['a path that resolves to a protocol-relative URL', '/..//evil.com'],
    ['an absolute URL', 'https://evil.com/'],
    ['a relative path', 'import'],
    ['nothing', undefined],
  ])('should refuse %s', (_label, value) => {
    expect(safeReturnPath(value)).toBeUndefined();
  });
});
