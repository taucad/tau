import { normalizeRepositoryArchive } from '@taucad/share/repository-archive';
import { shareArtifactLimits } from '@taucad/share/artifact';
import { isShareError } from '@taucad/share/provider';
import { parseRepositoryTarget } from '@taucad/share/repository-target';
import type {
  BitbucketRepoTargetV1,
  GitHubRepoTargetV1,
  GitLabRepoTargetV1,
  RepositoryProviderId,
} from '@taucad/share/repository-target';
// oxlint-disable-next-line import/extensions -- React Router generates this .js type-module alias from route.ts.
import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';

const requestTimeoutMilliseconds = 20_000;
const maximumMetadataBytes = 1024 * 1024;
const maximumRedirects = 3;
const archiveContentTypes = new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
const githubOwnerPattern = /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/u;
const githubRepositoryPattern = /^[A-Za-z\d_.-]{1,100}$/u;
const providerPaths: Readonly<Record<RepositoryProviderId, Readonly<Record<string, readonly RegExp[]>>>> = {
  github: {
    'api.github.com': [/^\/repositories\/\d+$/u, /^\/repos\/[^/]+\/[^/]+\/(?:commits|zipball)\/[^/]+$/u],
    'codeload.github.com': [/^\/[^/]+\/[^/]+\/(?:legacy\.)?zip\/[0-9a-f]{40}$/u],
  },
  gitlab: { 'gitlab.com': [/^\/api\/v4\/projects\/\d+\/repository\/archive\.zip$/u] },
  bitbucket: {
    'api.bitbucket.org': [/^\/2\.0\/repositories\/[^/]+\/[^/]+$/u],
    'bitbucket.org': [/^\/[^/]+\/[^/]+\/get\/[0-9a-f]{40}\.zip$/u],
  },
};

class GatewayError extends Error {
  public readonly status: number;
  public readonly retryAfter?: string;

  public constructor(status: number, message: string, retryAfter?: string) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const isProviderId = (value: string | undefined): value is RepositoryProviderId =>
  value === 'github' || value === 'gitlab' || value === 'bitbucket';

const assertAllowedUrl = (providerId: RepositoryProviderId, url: URL): void => {
  const paths = providerPaths[providerId][url.hostname];
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !paths?.some((pattern) => pattern.test(url.pathname)) ||
    url.pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new GatewayError(502, 'The repository provider returned an unsafe redirect.');
  }
};

const githubHeaders = (url: URL, token: string | undefined): Headers => {
  const headers = new Headers({ accept: 'application/vnd.github+json', 'user-agent': 'tau-repository-gateway' });
  if (token && url.hostname === 'api.github.com') {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

const retryAfter = (response: Response): string | undefined => {
  const direct = response.headers.get('retry-after');
  if (direct && direct.length <= 128) {
    return direct;
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return Number.isSafeInteger(reset) ? String(Math.max(0, Math.ceil(reset - Date.now() / 1000))) : undefined;
};

const fetchProvider = async ({
  providerId,
  url,
  signal,
  githubToken,
}: {
  readonly providerId: RepositoryProviderId;
  readonly url: URL;
  readonly signal: AbortSignal;
  readonly githubToken?: string;
}): Promise<Response> => {
  let current = url;
  for (let redirects = 0; redirects <= maximumRedirects; redirects++) {
    assertAllowedUrl(providerId, current);
    let response: Response;
    try {
      // oxlint-disable-next-line no-await-in-loop -- redirects are deliberately validated one at a time.
      response = await fetch(current, {
        headers: providerId === 'github' ? githubHeaders(current, githubToken) : { accept: 'application/zip' },
        credentials: 'omit',
        redirect: 'manual',
        signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw error;
      }
      throw new GatewayError(502, 'The repository provider could not be reached.');
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok) {
        const rateLimited =
          response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
        throw new GatewayError(
          response.status === 404 ? 404 : rateLimited ? 429 : 502,
          'The repository archive could not be fetched.',
          rateLimited ? retryAfter(response) : undefined,
        );
      }
      return response;
    }
    const location = response.headers.get('location');
    if (!location || redirects === maximumRedirects) {
      throw new GatewayError(502, 'The repository provider returned an invalid redirect.');
    }
    current = new URL(location, current);
  }
  throw new GatewayError(502, 'The repository provider returned too many redirects.');
};

const readBounded = async (response: Response, maximumBytes: number): Promise<Uint8Array<ArrayBuffer>> => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new GatewayError(413, 'The repository response exceeds the portable-share limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new GatewayError(502, 'The repository provider returned an unreadable response.');
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- standard stream reader contract.
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- streamed bounds must be applied before reading the next chunk.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > maximumBytes) {
        // oxlint-disable-next-line no-await-in-loop -- cancellation must settle before the stream lock is released.
        await reader.cancel();
        throw new GatewayError(413, 'The repository response exceeds the portable-share limit.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const bytes = await readBounded(response, maximumMetadataBytes);
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('Expected an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new GatewayError(502, 'The repository provider returned invalid metadata.');
  }
};

const githubArchiveUrl = async (
  target: GitHubRepoTargetV1,
  signal: AbortSignal,
  githubToken: string | undefined,
): Promise<URL> => {
  const metadataResponse = await fetchProvider({
    providerId: 'github',
    url: new URL(`https://api.github.com/repositories/${target.repositoryId}`),
    signal,
    githubToken,
  });
  const metadata = await readJson(metadataResponse);
  if (metadata['id'] !== target.repositoryId || typeof metadata['full_name'] !== 'string') {
    throw new GatewayError(404, 'The GitHub repository identity does not match this share link.');
  }
  const [owner, repository, ...extra] = metadata['full_name'].split('/');
  if (
    !owner ||
    !repository ||
    extra.length > 0 ||
    !githubOwnerPattern.test(owner) ||
    !githubRepositoryPattern.test(repository)
  ) {
    throw new GatewayError(502, 'GitHub returned an invalid repository identity.');
  }
  return new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zipball/${target.commit}`,
  );
};

const bitbucketArchiveUrl = async (target: BitbucketRepoTargetV1, signal: AbortSignal): Promise<URL> => {
  const metadataResponse = await fetchProvider({
    providerId: 'bitbucket',
    url: new URL(
      `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(target.workspaceUuid)}/${encodeURIComponent(target.repositoryUuid)}`,
    ),
    signal,
  });
  const metadata = await readJson(metadataResponse);
  const { workspace } = metadata;
  if (
    metadata['uuid'] !== target.repositoryUuid ||
    typeof workspace !== 'object' ||
    workspace === null ||
    Array.isArray(workspace) ||
    (workspace as Record<string, unknown>)['uuid'] !== target.workspaceUuid ||
    typeof metadata['full_name'] !== 'string'
  ) {
    throw new GatewayError(404, 'The Bitbucket repository identity does not match this share link.');
  }
  const [workspaceSlug, repositorySlug, ...extra] = metadata['full_name'].split('/');
  if (!workspaceSlug || !repositorySlug || extra.length > 0) {
    throw new GatewayError(502, 'Bitbucket returned an invalid repository identity.');
  }
  return new URL(
    `https://bitbucket.org/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(repositorySlug)}/get/${target.commit}.zip`,
  );
};

const archiveUrl = async (options: {
  readonly providerId: RepositoryProviderId;
  readonly target: GitHubRepoTargetV1 | GitLabRepoTargetV1 | BitbucketRepoTargetV1;
  readonly signal: AbortSignal;
  readonly githubToken?: string;
}): Promise<URL> => {
  const { providerId, target, signal, githubToken } = options;
  switch (providerId) {
    case 'github': {
      return githubArchiveUrl(target as GitHubRepoTargetV1, signal, githubToken);
    }
    case 'gitlab': {
      const value = target as GitLabRepoTargetV1;
      return new URL(
        `https://gitlab.com/api/v4/projects/${value.projectId}/repository/archive.zip?${new URLSearchParams({ sha: value.commit })}`,
      );
    }
    case 'bitbucket': {
      return bitbucketArchiveUrl(target as BitbucketRepoTargetV1, signal);
    }
  }
};

const githubImportArchiveUrl = async ({
  owner,
  repository,
  ref,
  signal,
  githubToken,
}: {
  readonly owner: string;
  readonly repository: string;
  readonly ref: string;
  readonly signal: AbortSignal;
  readonly githubToken?: string;
}): Promise<URL> => {
  if (
    !githubOwnerPattern.test(owner) ||
    !githubRepositoryPattern.test(repository) ||
    ref.length === 0 ||
    ref.length > 256
  ) {
    throw new GatewayError(400, 'The GitHub import target is malformed.');
  }
  const commitResponse = await fetchProvider({
    providerId: 'github',
    url: new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}`,
    ),
    signal,
    githubToken,
  });
  const commit = await readJson(commitResponse);
  if (typeof commit['sha'] !== 'string' || !/^[0-9a-f]{40}$/u.test(commit['sha'])) {
    throw new GatewayError(502, 'GitHub returned an invalid commit identity.');
  }
  return new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zipball/${commit['sha']}`,
  );
};

const contentTypeIsArchive = (response: Response): boolean => {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  return contentType !== undefined && archiveContentTypes.has(contentType);
};

/** Fixed-provider, bounded repository archive gateway used by sharing and the existing GitHub importer. */
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  }
  const url = new URL(request.url);
  const providerId = url.searchParams.get('provider') ?? undefined;
  if (!isProviderId(providerId)) {
    return new Response('Unsupported repository provider', { status: 400 });
  }
  const providerTimeout = AbortSignal.timeout(requestTimeoutMilliseconds);
  const signal = AbortSignal.any([request.signal, providerTimeout]);
  try {
    const { GITHUB_API_TOKEN: githubToken } = await getEnvironment();
    const reference = url.searchParams.get('target');
    const isShareRequest = reference !== null;
    let targetUrl: URL;
    let root = '';
    if (reference) {
      const target = parseRepositoryTarget(providerId, reference);
      root = target.root;
      targetUrl = await archiveUrl({ providerId, target, signal, githubToken });
    } else if (providerId === 'github') {
      targetUrl = await githubImportArchiveUrl({
        owner: url.searchParams.get('owner') ?? '',
        repository: url.searchParams.get('repo') ?? '',
        ref: url.searchParams.get('ref') ?? '',
        signal,
        githubToken,
      });
    } else {
      throw new GatewayError(400, 'The repository share target is missing.');
    }
    const response = await fetchProvider({ providerId, url: targetUrl, signal, githubToken });
    if (!contentTypeIsArchive(response)) {
      throw new GatewayError(502, 'The repository provider returned an unexpected content type.');
    }
    const archive = await readBounded(response, shareArtifactLimits.maxArchiveBytes);
    const normalized = isShareRequest ? await normalizeRepositoryArchive(archive, root) : undefined;
    const body = normalized?.archive ?? archive;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(body.byteLength),
        'Cache-Control': isShareRequest ? 'public, max-age=31536000, immutable' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      if (error.retryAfter) {
        headers.set('Retry-After', error.retryAfter);
      }
      return new Response(error.message, { status: error.status, headers });
    }
    if (isShareError(error)) {
      const status = error.code === 'SHARE_LOCATOR_INVALID' ? 400 : error.code === 'SHARE_ARTIFACT_LIMIT' ? 413 : 422;
      return new Response(error.message, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return new Response('The repository provider timed out.', {
        status: 504,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response('The repository request was cancelled.', {
        status: 499,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return new Response('The repository archive could not be loaded.', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
