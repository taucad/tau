import { z } from 'zod';
import { ENV } from '#environment.config.js';

const githubId = z.number().int().positive();
const connectionSchema = z.object({
  id: z.uuid(),
  subject: githubId,
  login: z.string().min(1),
  avatarUrl: z.url().optional(),
  generation: z.number().int().positive(),
});
const installationSchema = z.object({
  id: githubId,
  owner: z.object({ id: githubId, login: z.string(), avatarUrl: z.url().nullable(), type: z.string() }),
  repositorySelection: z.enum(['all', 'selected']),
  suspended: z.boolean(),
  permissions: z.record(z.string(), z.string()),
});
const repositorySchema = z.object({
  id: githubId,
  name: z.string(),
  fullName: z.string(),
  owner: z.object({ id: githubId, login: z.string(), avatarUrl: z.url().nullable(), type: z.string() }),
  visibility: z.enum(['public', 'private', 'internal']),
  access: z.enum(['unknown', 'read', 'write']),
  archived: z.boolean(),
  disabled: z.boolean(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  htmlUrl: z.url(),
  cloneUrl: z.url(),
});
const branchSchema = z.object({
  name: z.string().min(1),
  head: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .optional(),
});
const treeFileSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(['100644', '100755']),
  size: z.number().int().nonnegative(),
  oid: z.string().regex(/^[0-9a-f]{40}$/u),
});

export type GithubConnection = z.infer<typeof connectionSchema>;
export type GithubInstallation = z.infer<typeof installationSchema>;
export type GithubRepository = z.infer<typeof repositorySchema>;
export type GithubBranch = z.infer<typeof branchSchema>;
export type GithubTreeFile = z.infer<typeof treeFileSchema>;

const apiUrl = (path: string): string => `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/github${path}`;

const notFoundMessage =
  "GitHub didn't find this repository, or this connection can't access it. Check the Tau app's repository access on GitHub.";
const rateLimitedMessage = "GitHub's rate limit was reached. Try again in a few minutes.";

/**
 * One sentence per error code the GitHub connection routes (and the git proxy)
 * answer with; never shown raw. A `Map`, so no code reads `Object.prototype` (R-U7).
 */
const codeMessages: ReadonlyMap<string, string> = new Map([
  ['GITHUB_CONNECTION_UNAVAILABLE', "GitHub connection isn't set up on this deployment."],
  ['GITHUB_API_TOKEN_UNAVAILABLE', "Public GitHub import isn't set up on this deployment."],
  ['GITHUB_CONSENT_DENIED', 'GitHub access was not granted. Connect GitHub again to continue.'],
  ['GITHUB_CALLBACK_EXPIRED', 'The GitHub sign-in took too long or was already used. Connect GitHub again.'],
  ['GITHUB_CALLBACK_INVALID', 'The GitHub sign-in could not be verified. Connect GitHub again.'],
  ['GITHUB_CALLBACK_FAILED', 'GitHub could not finish connecting your account. Connect GitHub again.'],
  [
    'GITHUB_EXPIRING_TOKENS_REQUIRED',
    "This deployment's GitHub App must have expiring user access tokens enabled. Ask its administrator to turn them on.",
  ],
  [
    'GITHUB_APP_CREDENTIALS_INVALID',
    "This deployment's GitHub App credentials were rejected by GitHub. Ask its administrator to check them.",
  ],
  ['GITHUB_COMPLETION_PENDING', 'Finish connecting in the GitHub window, then return to Tau.'],
  ['GITHUB_COMPLETION_EXPIRED', 'The GitHub connection attempt expired. Connect GitHub again.'],
  ['GITHUB_COMPLETION_INVALID', 'This GitHub connection attempt is no longer valid. Connect GitHub again.'],
  ['GITHUB_COMPLETION_CANCELLED', 'The GitHub connection attempt was cancelled.'],
  [
    'GITHUB_COMPLETION_OWNER_MISMATCH',
    'This GitHub connection was started from a different Tau account. Sign in to that account, or connect again.',
  ],
  ['GITHUB_COMPLETION_BUSY', 'GitHub is still finishing the connection. Try again in a moment.'],
  ['GITHUB_COMPLETION_MODE_INVALID', 'Tau could not start the GitHub connection. Reload Tau and try again.'],
  ['GITHUB_START_COLLISION', 'Tau could not start the GitHub connection. Try again.'],
  ['RETURN_LOCATION_INVALID', 'Tau could not start the GitHub connection from this page. Reload Tau and try again.'],
  ['ORIGIN_INVALID', 'Tau could not start the GitHub connection from this address. Open Tau from its usual address.'],
  ['GITHUB_CONNECTION_NOT_FOUND', 'This GitHub account is no longer connected. Refresh and choose another account.'],
  ['GITHUB_CONNECTION_WRITE_FAILED', 'Tau could not save the GitHub connection. Try again.'],
  ['GITHUB_RECONNECT_REQUIRED', 'Your GitHub connection needs to be renewed. Connect GitHub again.'],
  ['GITHUB_REFRESH_BUSY', 'GitHub access is being renewed. Try again in a moment.'],
  ['GITHUB_REFRESH_CONFLICT', 'GitHub access changed while it was being renewed. Try again.'],
  ['GITHUB_RATE_LIMITED', rateLimitedMessage],
  ['GITHUB_SSO_REQUIRED', 'This organization requires single sign-on. Start an SSO session on GitHub, then try again.'],
  ['GITHUB_ACCESS_REFUSED', "GitHub refused access. Check the Tau app's repository access on GitHub."],
  ['GITHUB_NOT_FOUND_OR_DENIED', notFoundMessage],
  ['GITHUB_UPSTREAM_FAILED', 'GitHub returned an error. Try again shortly.'],
  ['GITHUB_UPSTREAM_UNAVAILABLE', "Tau couldn't reach GitHub. Try again shortly."],
  ['GITHUB_TREE_TOO_LARGE', 'This branch has too many files to list. Import a smaller repository or branch.'],
  ['GITHUB_TREE_UNSUPPORTED', "This branch tracks a submodule or symbolic link, which Tau can't import yet."],
  ['GITHUB_MANIFEST_TOO_LARGE', "This repository's tau.json is larger than 1 MiB. Reduce it before importing."],
  ['GITHUB_HEAD_INVALID', 'The selected branch has no valid commit. Choose another branch.'],
  ['GITHUB_ID_INVALID', 'That GitHub item could not be found. Refresh and try again.'],
  ['PAGE_INVALID', 'That GitHub page could not be loaded. Refresh and try again.'],
  ['GIT_PROXY_REDIRECTED_CREDENTIAL', 'This repository moved on GitHub. Reconnect it to follow the move.'],
  ['GIT_PROXY_UPSTREAM_FAILED', "Tau couldn't reach the Git host. Try again shortly."],
  ['GIT_PROXY_PORT_REFUSED', 'Tau can only sync with Git hosts on the standard HTTPS port.'],
  ['GIT_PROXY_RATE_LIMITED', 'Too many Git requests in a short time. Try again in a minute.'],
]);

const codeMessage = (code: string | undefined): string | undefined =>
  code === undefined ? undefined : codeMessages.get(code);

const statusMessage = (status: number): string =>
  status === 401
    ? 'Your Tau session ended. Sign in again, then retry.'
    : status === 404
      ? notFoundMessage
      : status === 429
        ? rateLimitedMessage
        : status >= 500
          ? 'GitHub or Tau is unavailable right now. Try again shortly.'
          : 'The GitHub request failed. Try again.';

/** A refused GitHub connection request; `message` is already the user-facing sentence. */
export class GithubRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  public constructor(status: number, code: string | undefined) {
    super(codeMessage(code) ?? statusMessage(status));
    this.name = 'GithubRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The one sentence to show for a failed GitHub request (D9). Raw codes, server
 * messages and schema errors never reach the page.
 *
 * @param error - Whatever the GitHub call threw; errors carrying a known `code` are mapped too.
 * @returns A user-facing sentence.
 */
export const githubErrorMessage = (error: unknown): string => {
  if (error instanceof GithubRequestError) {
    return error.message;
  }
  const message = codeMessage(
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined,
  );
  if (message !== undefined) {
    return message;
  }
  if (error instanceof z.ZodError) {
    return 'Tau received an unexpected answer from GitHub. Reload Tau and try again.';
  }
  if (error instanceof TypeError) {
    return "Tau couldn't reach its server. Check your connection and try again.";
  }
  return 'The GitHub request failed. Try again.';
};

async function request<Output>(path: string, schema: z.ZodType<Output>, init?: RequestInit): Promise<Output> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    /* D1: Fastify refuses a JSON content-type with an empty body before authentication. */
    headers: init?.body === undefined ? init?.headers : { 'content-type': 'application/json', ...init.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const refusal = z.object({ code: z.string().optional() }).safeParse(body);
    throw new GithubRequestError(response.status, refusal.success ? refusal.data.code : undefined);
  }
  return schema.parse(body);
}

export const githubConnections = Object.freeze({
  list: async (): Promise<readonly GithubConnection[]> => request('/connections', z.array(connectionSchema)),
  start: async (
    returnTo: string,
    completionMode: 'browser' | 'desktop-poll' = 'browser',
  ): Promise<{ attemptId: string; authorizationUrl: string }> =>
    request('/connections/start', z.object({ attemptId: z.uuid(), authorizationUrl: z.url() }), {
      method: 'POST',
      body: JSON.stringify({ returnTo, completionMode }),
    }),
  complete: async (attemptId: string): Promise<GithubConnection> =>
    request('/connections/complete', connectionSchema, { method: 'POST', body: JSON.stringify({ attemptId }) }),
  cancel: async (attemptId: string): Promise<void> => {
    await request(`/connection-attempts/${encodeURIComponent(attemptId)}`, z.void(), { method: 'DELETE' });
  },
  remove: async (connectionId: string): Promise<void> => {
    await request(`/connections/${encodeURIComponent(connectionId)}`, z.void(), { method: 'DELETE' });
  },
  configuration: async (): Promise<{ installUrl: string }> =>
    request('/configuration', z.object({ installUrl: z.url() })),
  installations: async (connectionId: string, page = 1) =>
    request(
      `/installations?connectionId=${encodeURIComponent(connectionId)}&page=${String(page)}`,
      z.object({
        totalCount: z.number().int().nonnegative(),
        installations: z.array(installationSchema),
        page: z.number(),
      }),
    ),
  repositories: async (connectionId: string, installationId: number, page = 1) =>
    request(
      `/repositories?connectionId=${encodeURIComponent(connectionId)}&installationId=${String(installationId)}&page=${String(page)}`,
      z.object({
        totalCount: z.number().int().nonnegative(),
        repositories: z.array(repositorySchema),
        page: z.number(),
      }),
    ),
  branches: async (connectionId: string, repositoryId: number, page = 1) =>
    request(
      `/repositories/${String(repositoryId)}/branches?connectionId=${encodeURIComponent(connectionId)}&page=${String(page)}`,
      z.object({ branches: z.array(branchSchema), page: z.number() }),
    ),
  repository: async (connectionId: string, repositoryId: number): Promise<GithubRepository> =>
    request(`/repositories/${String(repositoryId)}?connectionId=${encodeURIComponent(connectionId)}`, repositorySchema),
  branch: async (connectionId: string, repositoryId: number, name: string): Promise<GithubBranch> =>
    request(
      `/repositories/${String(repositoryId)}/branch?connectionId=${encodeURIComponent(connectionId)}&name=${encodeURIComponent(name)}`,
      branchSchema,
    ),
  tree: async (connectionId: string, repositoryId: number, head: string) =>
    request(
      `/repositories/${String(repositoryId)}/tree?connectionId=${encodeURIComponent(connectionId)}&head=${encodeURIComponent(head)}`,
      z.object({ files: z.array(treeFileSchema), manifestBase64: z.string().optional() }),
    ),
  token: async (connectionId: string): Promise<{ accessToken: string; expiresAt: string; generation: number }> =>
    request(
      `/connections/${encodeURIComponent(connectionId)}/token`,
      z.object({
        accessToken: z.string().min(1),
        expiresAt: z.iso.datetime(),
        generation: z.number().int().positive(),
      }),
      { method: 'POST' },
    ),
});

/*
 * A fixed stand-in for Tau's origin: only "does it stay on this origin" is
 * asked, and the route renders on the server too, where there is no `location`.
 */
const returnBase = 'https://tau.invalid';

/**
 * A same-origin path Tau may navigate to after GitHub returns (review R-U1).
 *
 * Resolved the way the browser will resolve it, because the URL parser strips
 * tab, CR and LF and reads a backslash as `/`: `/<TAB>/evil.com` is `//evil.com`, which
 * leaves Tau. Control characters are refused outright, the resolved URL must
 * keep the origin, and its path must not itself start a protocol-relative URL.
 *
 * @param value - The candidate path.
 * @returns The normalized path, search and hash, or `undefined` when it could leave Tau.
 */
export const safeReturnPath = (value: string | undefined): string | undefined => {
  if (value?.startsWith('/') !== true || /\p{Cc}/u.test(value)) {
    return undefined;
  }
  let resolved: URL;
  try {
    resolved = new URL(value, returnBase);
  } catch {
    return undefined;
  }
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return resolved.origin === returnBase && !path.startsWith('//') ? path : undefined;
};

const setupReturnKey = 'tau:github-setup-return';

/**
 * Where "Configure GitHub access" returns once GitHub redirects to the App's
 * Setup URL (`/github/complete?installation_id=…&setup_action=…`, D16d). That
 * redirect carries no Tau state, so the page remembers it for this tab.
 */
export const githubSetupReturn = Object.freeze({
  remember(path: string): void {
    try {
      globalThis.sessionStorage.setItem(setupReturnKey, path);
    } catch {
      // Storage refused (private mode): the completion page offers its own way back.
    }
  },
  /* Read, not consumed: a render may run twice, and the next Configure overwrites it. */
  read(): string | undefined {
    try {
      return safeReturnPath(globalThis.sessionStorage.getItem(setupReturnKey) ?? undefined);
    } catch {
      return undefined;
    }
  },
});
