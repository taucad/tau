import { Octokit } from '@octokit/rest';
import { metaConfig } from '#constants/meta.constants.js';
import { ENV } from '#config.js';

/**
 * GitHub API client singleton
 * Provides authenticated access to GitHub API with proper typing
 */
class GitHubApiClient {
  public static getInstance(auth?: string): GitHubApiClient {
    GitHubApiClient.instance ??= new GitHubApiClient(auth);
    return GitHubApiClient.instance;
  }

  private static instance: GitHubApiClient | undefined;

  private readonly octokit: Octokit;

  private constructor(auth?: string) {
    this.octokit = new Octokit({
      auth,
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
   * Get list of branches for a repository
   */
  public async listBranches(owner: string, repo: string): Promise<Array<{ name: string; sha: string }>> {
    const { data } = await this.octokit.repos.listBranches({
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub API uses snake_case
      per_page: 100,
    });

    return data.map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha,
    }));
  }

  /**
   * Download repository archive as a stream with size information
   * Uses proxy to avoid CORS issues
   * Returns both the stream and the content length from the response headers
   *
   * Note: GitHub API returns Content-Length header when using full refs like refs/heads/main
   */
  public async downloadArchiveWithSize(
    owner: string,
    repo: string,
    ref: string,
    signal?: AbortSignal,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number | undefined }> {
    // Convert short ref to full ref for GitHub API (required for Content-Length header)
    // refs/heads/main, refs/tags/v1.0, etc work; short refs like "main" don't return Content-Length
    const fullRef = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;

    // Use GitHub API endpoint (not direct codeload.github.com) to get Content-Length header
    const zipUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${fullRef}`;
    // Use proxy endpoint to avoid CORS issues
    const proxyUrl = `/api/import?url=${encodeURIComponent(zipUrl)}`;

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
 * Get GitHub API client instance
 * Pass token from environment variable or config
 */
export function getGitHubClient(): GitHubApiClient {
  return GitHubApiClient.getInstance(ENV.GITHUB_API_TOKEN);
}
