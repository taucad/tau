import { Octokit } from '@octokit/rest';
import { metaConfig } from '#constants/meta.constants.js';
import { ENV } from '#config.js';

/**
 * GitHub API client singleton
 * Provides authenticated access to GitHub API with proper typing
 */
function buildCodeloadZipUrl(owner: string, repo: string, ref: string): string {
  const ownerSegment = encodeURIComponent(owner);
  const repoSegment = encodeURIComponent(repo);
  // Allow refs like "refs/heads/main" to pass through unchanged to keep slashes meaningful.
  const refSegment = ref.startsWith('refs/') ? ref : ref;
  return `https://codeload.github.com/${ownerSegment}/${repoSegment}/zip/${refSegment}`;
}

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
   * Get the size of a repository archive (ZIP)
   * Makes a HEAD request directly against codeload (which provides Content-Length)
   * Uses proxy to avoid CORS issues
   */
  public async getArchiveSize(owner: string, repo: string, ref: string): Promise<number | undefined> {
    const zipUrl = buildCodeloadZipUrl(owner, repo, ref);
    // Use proxy endpoint to avoid CORS issues
    const proxyUrl = `/api/import?url=${encodeURIComponent(zipUrl)}`;

    try {
      const response = await fetch(proxyUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });

      if (!response.ok) {
        return undefined;
      }

      const contentLength = response.headers.get('Content-Length');
      if (!contentLength) {
        return undefined;
      }

      return Number.parseInt(contentLength, 10);
    } catch {
      return undefined;
    }
  }

  /**
   * Download repository archive as a stream with size information
   * Uses proxy to avoid CORS issues
   * Returns both the stream and the content length from the response headers
   */
  public async downloadArchiveWithSize(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number | undefined }> {
    const zipUrl = buildCodeloadZipUrl(owner, repo, ref);
    // Use proxy endpoint to avoid CORS issues
    const proxyUrl = `/api/import?url=${encodeURIComponent(zipUrl)}`;

    const response = await fetch(proxyUrl, { redirect: 'follow' });

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
