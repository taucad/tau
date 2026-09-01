import { Octokit } from '@octokit/rest';
import type { GithubBranchesResponse } from '#routes/api.github-branches/route.js';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * Error thrown when GitHub's Git Trees API returns a truncated response.
 * This occurs when the repository tree exceeds ~100,000 entries or 7MB response size.
 *
 * Callers should catch this error and implement alternative strategies:
 * - Use Repository Contents API for incremental directory traversal
 * - Use GraphQL API with pagination
 * - Clone the repository locally
 * - Filter to a specific subdirectory
 */
export class GitHubTreeTruncatedError extends Error {
  public readonly owner: string;
  public readonly repo: string;
  public readonly ref: string;
  public readonly partialCount: number;

  public constructor({
    owner,
    repo,
    ref,
    partialCount,
    message,
  }: {
    owner: string;
    repo: string;
    ref: string;
    partialCount: number;
    message: string;
  }) {
    super(message);
    this.name = 'GitHubTreeTruncatedError';
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.partialCount = partialCount;
  }
}

/**
 * GitHub API client singleton.
 *
 * Unauthenticated by design: this runs in the browser, so it must never hold a
 * token. Endpoints that require authentication go through the Tau API instead
 * (see `listBranches`), which holds the GitHub token server-side.
 * Public reads are subject to GitHub's unauthenticated rate limit.
 */
class GitHubApiClient {
  public static getInstance(): GitHubApiClient {
    GitHubApiClient.instance ??= new GitHubApiClient();
    return GitHubApiClient.instance;
  }

  private static instance: GitHubApiClient | undefined;

  private readonly octokit: Octokit;

  private constructor() {
    this.octokit = new Octokit({
      userAgent: metaConfig.userAgent,
    });
  }

  /**
   * Get repository metadata
   */
  public async getRepository(
    owner: string,
    repo: string,
  ): Promise<{
    avatarUrl: string | undefined;
    description: string | undefined;
    stars: number;
    forks: number;
    watchers: number;
    license: string | undefined;
    defaultBranch: string;
    isPrivate: boolean;
    lastUpdated: string;
  }> {
    const { data } = await this.octokit.repos.get({
      owner,
      repo,
    });

    return {
      avatarUrl: data.owner.avatar_url,
      description: data.description ?? undefined,
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      license: data.license?.spdx_id ?? undefined,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      lastUpdated: data.updated_at,
    };
  }

  /**
   * Get list of branches for a repository with commit timestamps.
   *
   * Delegates to `/api/github-branches` because GitHub's GraphQL API rejects
   * unauthenticated requests, and the token must stay server-side. The route
   * owns the query, the per-page sort and the default-branch hoist; it reports
   * a non-OK status when the token is missing or rejected, which surfaces here
   * as a throw the import machine already degrades on.
   */
  public async listBranches({
    owner,
    repo,
    pageSize = 100,
    cursor,
  }: {
    owner: string;
    repo: string;
    pageSize?: number;
    cursor?: string;
  }): Promise<{
    branches: Array<{ name: string; sha: string; updatedAt: number }>;
    hasMore: boolean;
    endCursor: string | undefined;
  }> {
    const parameters = new URLSearchParams({ owner, repo, pageSize: String(pageSize) });
    if (cursor !== undefined) {
      parameters.set('cursor', cursor);
    }

    const response = await fetch(`/api/github-branches?${parameters.toString()}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = (await response.json()) as GithubBranchesResponse;

    return {
      branches: [...body.branches],
      hasMore: body.hasMore,
      endCursor: body.endCursor,
    };
  }

  /**
   * List files in a repository tree (without downloading content)
   * Uses the Git Trees API with recursive option
   * Filters to only include files (blobs), not directories (trees)
   *
   * @throws {GitHubTreeTruncatedError} When the tree is too large (>100k entries or >7MB response)
   *         and GitHub returns a truncated result. Callers should handle this error and consider
   *         alternative strategies for large repositories.
   */
  public async listFiles(owner: string, repo: string, ref: string): Promise<Array<{ path: string; size: number }>> {
    // Get the tree for the ref
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub API uses snake_case
      tree_sha: ref,
      recursive: 'true',
    });

    // Check if the tree response was truncated due to size limits
    // GitHub truncates trees exceeding ~100,000 entries or 7MB response size
    if (data.truncated) {
      throw new GitHubTreeTruncatedError({
        owner,
        repo,
        ref,
        partialCount: data.tree.length,
        message:
          'The repository tree is too large and was truncated by GitHub. ' +
          'Consider using one of the following alternative strategies:\n' +
          '1. Use the Repository Contents API to traverse directories incrementally\n' +
          '2. Use the GraphQL API with pagination for more control\n' +
          '3. Clone the repository locally using git\n' +
          '4. Filter to a specific subdirectory if you only need part of the tree',
      });
    }

    // Filter to only blobs (files) and map to path/size
    return data.tree
      .filter((item) => item.type === 'blob')
      .map((item) => ({
        path: item.path,
        size: item.size ?? 0,
      }));
  }

  /**
   * Download repository archive as a stream with size information
   * Uses proxy to avoid CORS issues
   * Returns both the stream and the content length from the response headers
   *
   * Note: GitHub API returns Content-Length header when using full refs like refs/heads/main
   */
  /**
   * Get the proxied archive download URL for a repository.
   * Intended for use by the import worker which fetches off the main thread.
   */
  public getArchiveUrl({ owner, repo, ref }: { owner: string; repo: string; ref: string }): string {
    return `/api/import?${new URLSearchParams({ provider: 'github', owner, repo, ref })}`;
  }

  /**
   * Get auth headers to pass to fetch requests (e.g. in workers).
   */
  public getAuthHeaders(): Record<string, string> {
    return {
      'User-Agent': metaConfig.userAgent,
      accept: 'application/vnd.github.v3+json',
      'Accept-Encoding': 'identity',
    };
  }

  public async downloadArchiveWithSize({
    owner,
    repo,
    ref,
    signal,
  }: {
    owner: string;
    repo: string;
    ref: string;
    signal?: AbortSignal;
  }): Promise<{
    stream: ReadableStream<Uint8Array<ArrayBuffer>>;
    size: number | undefined;
  }> {
    const proxyUrl = this.getArchiveUrl({ owner, repo, ref });

    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': metaConfig.userAgent,
        accept: 'application/vnd.github.v3+json',
        // Request uncompressed to get accurate size
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Get content length from the GET response
    const contentLengthHeader = response.headers.get('Content-Length');
    const size = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined;

    return {
      stream: response.body,
      size,
    };
  }
}

/**
 * Get the GitHub API client instance.
 *
 * Deliberately unauthenticated — see `GitHubApiClient`. Authenticated calls go
 * through the Tau API so the GitHub token never reaches the browser.
 */
export function getGitHubClient(): GitHubApiClient {
  return GitHubApiClient.getInstance();
}
