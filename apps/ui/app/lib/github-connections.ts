import { z } from 'zod';
import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';

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

  /**
   * @param status - The HTTP status the API answered.
   * @param code - The API's refusal code, when it sent one.
   * @param message - The sentence for this surface, when the request knows better than the code table.
   */
  public constructor(status: number, code: string | undefined, message?: string) {
    super(message ?? codeMessage(code) ?? statusMessage(status));
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

/**
 * The sentences a minted backup credential answers with where the code table's
 * would mislead (R23). The token is minted for a project's GitHub backup, so a
 * removed account names what reconnecting restores; the table's "Refresh and
 * choose another account" belongs to the repository picker.
 */
const backupCredentialMessages: ReadonlyMap<string, string> = new Map([
  ['GITHUB_CONNECTION_NOT_FOUND', 'Reconnect GitHub to back up this project.'],
]);

/**
 * A refused backup credential mint, worded for the backup it stopped (R23).
 *
 * @param error - What the mint threw.
 * @returns The same refusal with the backup sentence, or `error` unchanged.
 */
const backupCredentialRefusal = (error: unknown): unknown => {
  if (!(error instanceof GithubRequestError) || error.code === undefined) {
    return error;
  }
  const message = backupCredentialMessages.get(error.code);
  return message === undefined ? error : new GithubRequestError(error.status, error.code, message);
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
  ): Promise<{ attemptId: string; authorizationUrl: string }> => {
    const started = await request('/connections/start', z.object({ attemptId: z.uuid(), authorizationUrl: z.url() }), {
      method: 'POST',
      body: JSON.stringify({ returnTo, completionMode }),
    });
    if (completionMode === 'browser') {
      /* R24: an expired attempt's callback cannot say where this one was going. */
      githubConnectReturn.remember(returnTo);
    }
    return started;
  },
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
  /* Minted for a project's GitHub backup, so its refusals name the backup (R23). */
  token: async (connectionId: string): Promise<{ accessToken: string; expiresAt: string; generation: number }> => {
    try {
      return await request(
        `/connections/${encodeURIComponent(connectionId)}/token`,
        z.object({
          accessToken: z.string().min(1),
          expiresAt: z.iso.datetime(),
          generation: z.number().int().positive(),
        }),
        { method: 'POST' },
      );
    } catch (error) {
      throw backupCredentialRefusal(error);
    }
  },
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

/** A return path this tab remembers across a round trip to GitHub. */
type TabReturn = Readonly<{
  /** Stores `path` in this tab's session storage. */
  remember: (path: string) => void;
  /** The remembered same-origin path, left in place. */
  read: () => string | undefined;
  /** The remembered same-origin path, forgotten as it is read. */
  take: () => string | undefined;
}>;

/**
 * A return path kept in session storage. Storage can be refused (private
 * mode); nothing is remembered then, and the completion page offers its own
 * way back.
 *
 * @param key - The session storage key.
 * @returns The path's memory.
 */
const tabReturn = (key: string): TabReturn => {
  const read = (): string | undefined => {
    try {
      return safeReturnPath(globalThis.sessionStorage.getItem(key) ?? undefined);
    } catch {
      return undefined;
    }
  };
  return Object.freeze({
    remember(path: string): void {
      try {
        globalThis.sessionStorage.setItem(key, path);
      } catch {
        // Storage refused: nothing is remembered.
      }
    },
    read,
    take(): string | undefined {
      const path = read();
      try {
        globalThis.sessionStorage.removeItem(key);
      } catch {
        // Storage refused: nothing was remembered.
      }
      return path;
    },
  });
};

/**
 * Where "Configure GitHub access" returns once GitHub redirects to the App's
 * Setup URL (`/github/complete?installation_id=…&setup_action=…`, D16d). That
 * redirect carries no Tau state, so the page remembers it for this tab, and
 * the completion page takes it: a later setup redirect (an install started on
 * GitHub itself) must not return to this one's page (R10).
 */
export const githubSetupReturn = tabReturn('tau:github-setup-return');

/**
 * Where the last GitHub connection started in this tab returns (R24). GitHub's
 * callback for an attempt that outlived its start record carries no Tau state,
 * so *Connect GitHub again* reads it to return where the first attempt would have.
 */
export const githubConnectReturn = tabReturn('tau:github-connect-return');

/**
 * Sends the page to GitHub to change which repositories the Tau app reaches.
 *
 * The answer when an account works but a repository is not shared with the app
 * (moved to another owner, or removed from the installation): signing in again
 * cannot share it (D67).
 *
 * @param installUrl - The App's installation page, from `githubConnections.configuration()`.
 * @param returnTo - Where `/github/complete` returns once GitHub is done.
 */
export const configureGithubAccess = (installUrl: string, returnTo: string): void => {
  if (!isDesktopTarget) {
    /* D16d: GitHub returns to the App's Setup URL (/github/complete) with no Tau state. */
    githubSetupReturn.remember(returnTo);
  }
  globalThis.location.assign(installUrl);
};
