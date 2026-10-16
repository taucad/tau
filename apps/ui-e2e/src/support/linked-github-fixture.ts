/**
 * The far side of a GitHub-linked project, with neither GitHub nor the Tau API
 * running: a real bare repository behind `git http-backend`, reached through
 * the same `/v1/git/proxy` address the browser worker uses for GitHub, and the
 * few API answers that link a project to it through the Sync region's picker.
 *
 * `apps/ui-e2e` boots no API (C60), and a live GitHub App connection needs a
 * person at GitHub's consent page, so the network boundary is the seam: one
 * Playwright route on the API origin answers for the whole browser context,
 * dedicated workers included, which is where the revisions worker pushes from.
 * What the page and the worker do is the product's own; only the far side is a
 * fixture. The git leg is real git, so a push that lands is a push git took.
 *
 * Offline is honoured here as well as by the browser: while the spec has the
 * context offline, every routed request is aborted the way an unreachable host
 * is, so nothing this fixture answers can make a save look backed up early.
 *
 * Test support only. The bare repository lives in a fresh operating-system
 * temporary directory and is removed by `dispose`.
 */

/* eslint-disable @typescript-eslint/naming-convention -- CGI environment variables and HTTP header names carry their own casing. */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import type { BrowserCommandContext } from 'vitest/node';

/* The driver types come from the command context, so this support file never imports the driver. */
type BrowserContext = BrowserCommandContext['context'];
type Route = Parameters<Parameters<BrowserContext['route']>[1]>[0];
type Request = ReturnType<Route['request']>;

/** What a spec needs to pick the fixture's repository in the picker. */
export type LinkedGithubFixtureDescription = Readonly<{
  /** The GitHub account the fake connection is for. */
  login: string;
  /** `owner/name`, as the picker lists it. */
  repositoryFullName: string;
  /** The address the project is linked to. */
  cloneUrl: string;
}>;

/** What reached the far side, for the assertions a page cannot make. */
export type LinkedGithubFixtureState = Readonly<{
  /** `POST …/git-receive-pack` requests git answered: one per push. */
  pushes: number;
  writeEnabled: boolean;
  writeTokens: number;
  /** `POST …/git-upload-pack` requests git answered: one per fetch with something to negotiate. */
  fetches: number;
  /** Git requests that arrived without the minted GitHub credential. */
  uncredited: number;
  /** Commits on the repository's `main`; `0` before the first push. */
  commits: number;
  /** The repository's `main`, when it exists. */
  head: string | undefined;
  /** API paths the fixture had no answer for, oldest first. */
  unanswered: readonly string[];
}>;

/** One running fixture. */
export type LinkedGithubFixture = Readonly<{
  describe: () => LinkedGithubFixtureDescription;
  read: () => Promise<LinkedGithubFixtureState>;
  dispose: () => Promise<void>;
}>;

/** How one fixture is created. */
export type LinkedGithubFixtureOptions = Readonly<{
  context: BrowserContext;
  /** The Tau API origin the page and its workers were built against. */
  apiOrigin: string;
  /** The page's origin, echoed on every CORS answer. */
  pageOrigin: string;
  /** Whether the spec has the context offline right now. */
  isOffline: () => boolean;
}>;

const login = 'tau-e2e';
const repositoryName = 'offline-sync';
const repositoryFullName = `${login}/${repositoryName}`;
const cloneUrl = `https://github.com/${repositoryFullName}.git`;
const connectionId = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const accountId = 4_242_001;
const installationId = 4_242_002;
const repositoryId = 4_242_003;
/** A fake token: it never leaves the browser context, and git never sees it. */
const accessToken = 'tau-e2e-linked-github-read-token';
const writeAccessToken = 'tau-e2e-linked-github-write-token';
const writeAuthorization = `Basic ${Buffer.from(`x-access-token:${writeAccessToken}`).toString('base64')}`;
const expectedAuthorization = `Basic ${Buffer.from(`x-access-token:${accessToken}`).toString('base64')}`;
const userId = 'tau-e2e-linked-github-user';

const decoder = new TextDecoder();

const run = async (args: readonly string[], cwd: string): Promise<{ code: number; stdout: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: decoder.decode(Buffer.concat(out)).trim() });
    });
  });

const requireGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const result = await run(args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} exited with ${String(result.code)}.`);
  }
  return result.stdout;
};

/** Where the CGI header block ends: the first CRLF CRLF in the bytes. */
const headerEnd = (payload: Uint8Array<ArrayBuffer>): number => {
  for (let index = 0; index + 3 < payload.length; index += 1) {
    if (payload[index] === 13 && payload[index + 1] === 10 && payload[index + 2] === 13 && payload[index + 3] === 10) {
      return index;
    }
  }
  return -1;
};

/** `git http-backend` answers as a CGI program: headers, a blank line, then the body. */
type CgiAnswer = { status: number; headers: Record<string, string>; body: Uint8Array<ArrayBuffer> };

const parseCgi = (payload: Uint8Array<ArrayBuffer>): CgiAnswer => {
  const separator = headerEnd(payload);
  const head = separator === -1 ? '' : decoder.decode(payload.subarray(0, separator));
  const body = separator === -1 ? payload : payload.subarray(separator + 4);
  const headers: Record<string, string> = {};
  let status = 200;
  for (const line of head.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'status') {
      status = Number.parseInt(value, 10);
    } else {
      headers[name] = value;
    }
  }
  return { status, headers, body };
};

const gitBackend = async (
  root: string,
  input: Readonly<{
    method: string;
    pathInfo: string;
    query: string;
    contentType?: string;
    body?: Uint8Array<ArrayBuffer>;
  }>,
): Promise<CgiAnswer> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['http-backend'], {
      cwd: root,
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: input.pathInfo,
        QUERY_STRING: input.query,
        REQUEST_METHOD: input.method,
        REMOTE_USER: login,
        REMOTE_ADDR: '127.0.0.1',
        ...(input.contentType === undefined ? {} : { CONTENT_TYPE: input.contentType }),
        ...(input.body === undefined ? {} : { CONTENT_LENGTH: String(input.body.byteLength) }),
      },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', () => {
      resolve(parseCgi(Buffer.concat(chunks)));
    });
    child.stdin.end(input.body);
  });

const owner = { id: accountId, login, avatarUrl: null, type: 'User' } as const;
const repository = {
  id: repositoryId,
  name: repositoryName,
  fullName: repositoryFullName,
  owner,
  visibility: 'private',
  access: 'write',
  archived: false,
  disabled: false,
  description: 'Offline-sync fixture',
  defaultBranch: 'main',
  htmlUrl: `https://github.com/${repositoryFullName}`,
  cloneUrl,
} as const;
const connection = { id: connectionId, subject: accountId, login, generation: 1 } as const;
const timestamp = '2026-01-01T00:00:00.000Z';

/**
 * The API answers that sign a person in and list one GitHub account with one
 * writable repository. Anything else is refused fast, as an unconfigured route
 * would be, and recorded so a spec can tell what the page asked for.
 */
const apiAnswer = (method: string, url: URL): { status: number; body: unknown } | undefined => {
  const path = url.pathname;
  if (path === '/v1/auth/get-session') {
    return {
      status: 200,
      body: {
        session: {
          id: `session-${userId}`,
          userId,
          token: 'tau-e2e-linked-github-session',
          expiresAt: '2099-01-01T00:00:00.000Z',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        user: {
          id: userId,
          email: 'linked-github@e2e.tau',
          name: 'Linked GitHub E2E',
          emailVerified: true,
          image: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    };
  }
  if (path === '/v1/auth/account-info') {
    return { status: 200, body: { user: { id: String(accountId), name: 'tau-e2e', email: 'tau-e2e@example.com' } } };
  }
  if (path === '/v1/auth/list-accounts') {
    return {
      status: 200,
      body: [
        {
          id: 'oauth-account',
          accountId: String(accountId),
          userId,
          providerId: 'github',
          createdAt: timestamp,
          updatedAt: timestamp,
          scopes: ['read:user', 'user:email', 'gist'],
        },
      ],
    };
  }
  if (path === '/v1/github/configuration') {
    return { status: 200, body: { installUrl: 'https://github.com/apps/tau-e2e/installations/new' } };
  }
  if (path === '/v1/github/connections' && method === 'GET') {
    return { status: 200, body: [connection] };
  }
  if (path === '/v1/github/installations') {
    return {
      status: 200,
      body: {
        totalCount: 1,
        page: 1,
        installations: [
          {
            id: installationId,
            owner,
            repositorySelection: 'selected',
            suspended: false,
            permissions: { contents: 'write', metadata: 'read' },
          },
        ],
      },
    };
  }
  if (path === '/v1/github/repositories') {
    return { status: 200, body: { totalCount: 1, page: 1, repositories: [repository] } };
  }
  if (path === `/v1/github/repositories/${String(repositoryId)}`) {
    return { status: 200, body: repository };
  }
  if (path === `/v1/github/repositories/${String(repositoryId)}/branches`) {
    /* An empty repository: the picker offers its default branch (D14). */
    return { status: 200, body: { branches: [], page: 1 } };
  }
  return undefined;
};

/**
 * Start the fixture and route the API origin through it for this context.
 *
 * @param options - The context, the two origins and the spec's offline switch.
 * @returns The running fixture.
 */
export const startLinkedGithubFixture = async (options: LinkedGithubFixtureOptions): Promise<LinkedGithubFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-ui-e2e-linked-github-'));
  const repositoryPath = join(root, `${repositoryName}.git`);
  await requireGit(['init', '--quiet', '--bare', '--initial-branch=main', repositoryPath], root);
  await requireGit(['config', 'http.receivepack', 'true'], repositoryPath);

  let pushes = 0;
  let writeEnabled = false;
  let gistEnabled = true;
  let writeTokens = 0;
  let fetches = 0;
  let uncredited = 0;
  const unanswered: string[] = [];
  const repositoryPrefix = `${cloneUrl}/`;

  const cors = (request: Request): Record<string, string> => ({
    'access-control-allow-origin': request.headers()['origin'] ?? options.pageOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'content-type,content-length,www-authenticate,cache-control,expires,pragma',
    vary: 'origin',
  });

  const proxy = async (route: Route, request: Request, url: URL): Promise<void> => {
    const target = url.searchParams.get('url') ?? '';
    if (!target.startsWith(repositoryPrefix)) {
      unanswered.push(`${request.method()} ${url.pathname} → ${target}`);
      await route.fulfill({
        status: 404,
        headers: { ...cors(request), 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'GITHUB_NOT_FOUND_OR_DENIED' }),
      });
      return;
    }
    const remote = new URL(target);
    const rest = remote.pathname.slice(new URL(cloneUrl).pathname.length);
    const received = request.headers()['x-tau-proxy-authorization'];
    const writing = rest === '/git-receive-pack' || remote.searchParams.get('service') === 'git-receive-pack';
    if (
      writing ? received !== writeAuthorization : ![expectedAuthorization, writeAuthorization].includes(received ?? '')
    ) {
      uncredited += 1;
      await route.fulfill({ status: 403, headers: cors(request), body: 'Insufficient repository permission' });
      return;
    }
    const answer = await gitBackend(root, {
      method: request.method(),
      pathInfo: `/${repositoryName}.git${rest}`,
      query: remote.search.replace(/^\?/u, ''),
      ...(request.headers()['content-type'] === undefined ? {} : { contentType: request.headers()['content-type'] }),
      ...(request.method() === 'POST' ? { body: new Uint8Array(request.postDataBuffer() ?? []) } : {}),
    });
    if (request.method() === 'POST' && rest === '/git-receive-pack' && answer.status === 200) {
      pushes += 1;
    }
    if (request.method() === 'POST' && rest === '/git-upload-pack' && answer.status === 200) {
      fetches += 1;
    }
    await route.fulfill({
      status: answer.status,
      headers: { ...answer.headers, ...cors(request) },
      body: Buffer.from(answer.body.buffer, answer.body.byteOffset, answer.body.byteLength),
    });
  };

  const handle = async (route: Route, request: Request): Promise<void> => {
    if (options.isOffline()) {
      await route.abort('internetdisconnected');
      return;
    }
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors(request),
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
          'access-control-max-age': '600',
        },
      });
      return;
    }
    if (url.pathname === '/v1/git/proxy') {
      await proxy(route, request, url);
      return;
    }
    let answer: { status: number; body: unknown } | undefined;
    if (url.pathname === `/v1/github/connections/${connectionId}/token` && request.method() === 'POST') {
      const input = request.postDataJSON() as { repositoryId?: number; operation?: string };
      if (input.repositoryId !== repositoryId || !['read', 'write'].includes(input.operation ?? '')) {
        answer = { status: 400, body: { code: 'GITHUB_TOKEN_TARGET_REQUIRED' } };
      } else if (input.operation === 'write' && !writeEnabled) {
        answer = { status: 403, body: { code: 'GITHUB_REPOSITORY_WRITE_DISABLED' } };
      } else {
        if (input.operation === 'write') {
          writeTokens += 1;
        }
        answer = {
          status: 200,
          body: {
            accessToken: input.operation === 'write' ? writeAccessToken : accessToken,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            generation: 1,
          },
        };
      }
    } else if (url.pathname === `/v1/github/connections/${connectionId}/repositories/${repositoryId}/access`) {
      answer = {
        status: 200,
        body: {
          repositoryId,
          ownerId: accountId,
          fullName: repositoryFullName,
          cloneUrl,
          canRead: true,
          canWrite: true,
          writeEnabled,
          authorizationVersion: 1,
          verifiedAt: new Date().toISOString(),
        },
      };
    } else if (
      url.pathname === `/v1/github/connections/${connectionId}/repositories/${repositoryId}/write` &&
      request.method() === 'POST'
    ) {
      writeEnabled = (request.postDataJSON() as { enabled: boolean }).enabled;
      answer = { status: 200, body: { writeEnabled } };
    } else if (url.pathname === '/v1/github/gists/capability') {
      answer = {
        status: 200,
        body: {
          status: gistEnabled ? 'connected' : 'disabled',
          enabled: gistEnabled,
          grantedScopes: ['read:user', 'user:email', 'gist'],
          authorizationUrl: 'https://github.com/settings/connections/applications/tau-e2e',
          account: { id: accountId, login },
          verifiedAt: new Date().toISOString(),
        },
      };
    } else if (url.pathname === '/v1/github/gists/use' && request.method() === 'POST') {
      gistEnabled = (request.postDataJSON() as { enabled: boolean }).enabled;
      answer = { status: 200, body: { enabled: gistEnabled } };
    } else {
      answer = apiAnswer(request.method(), url);
    }
    if (answer === undefined) {
      unanswered.push(`${request.method()} ${url.pathname}`);
    }
    await route.fulfill({
      status: answer?.status ?? 503,
      headers: { ...cors(request), 'content-type': 'application/json' },
      body: JSON.stringify(answer?.body ?? { message: 'Not part of the linked GitHub fixture' }),
    });
  };

  const matches = (url: URL): boolean => url.origin === options.apiOrigin;
  await options.context.route(matches, handle);

  return Object.freeze({
    describe: () => ({ login, repositoryFullName, cloneUrl }),
    read: async () => {
      const head = await run(['rev-parse', '--verify', '--quiet', 'refs/heads/main'], repositoryPath);
      const commits =
        head.code === 0 ? Number(await requireGit(['rev-list', '--count', 'refs/heads/main'], repositoryPath)) : 0;
      return {
        pushes,
        writeEnabled,
        writeTokens,
        fetches,
        uncredited,
        commits,
        head: head.code === 0 ? head.stdout : undefined,
        unanswered: [...unanswered],
      };
    },
    dispose: async () => {
      await options.context.unroute(matches, handle).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    },
  });
};
