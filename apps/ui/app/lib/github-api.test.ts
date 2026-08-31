import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGitHubClient } from '#lib/github-api.js';

describe('GitHubApiClient', () => {
  let client: ReturnType<typeof getGitHubClient>;

  beforeEach(() => {
    client = getGitHubClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getArchiveUrl
  // ---------------------------------------------------------------------------

  describe('getArchiveUrl', () => {
    it('should return a typed proxied URL', () => {
      const url = client.getArchiveUrl({ owner: 'myorg', repo: 'myrepo', ref: 'main' });

      expect(url).toBe('/api/import?provider=github&owner=myorg&repo=myrepo&ref=main');
    });

    it('should preserve refs/ prefix when already present', () => {
      const url = client.getArchiveUrl({ owner: 'o', repo: 'r', ref: 'refs/tags/v1.0' });

      expect(url).toContain('ref=refs%2Ftags%2Fv1.0');
    });

    it('should encode special characters in owner and repo', () => {
      const url = client.getArchiveUrl({ owner: 'my org', repo: 'my repo', ref: 'main' });

      const parsed = new URL(url, 'https://tau.new');
      expect(parsed.searchParams.get('owner')).toBe('my org');
      expect(parsed.searchParams.get('repo')).toBe('my repo');
    });
  });

  // ---------------------------------------------------------------------------
  // getAuthHeaders
  // ---------------------------------------------------------------------------

  describe('getAuthHeaders', () => {
    it('should return headers with User-Agent', () => {
      const headers = client.getAuthHeaders();

      expect(headers).toEqual(
        expect.objectContaining({
          'User-Agent': expect.any(String) as string,
          accept: 'application/vnd.github.v3+json',
          'Accept-Encoding': 'identity',
        }),
      );
    });

    it('should return a non-empty User-Agent', () => {
      const headers = client.getAuthHeaders();
      expect(headers['User-Agent']!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // listBranches — delegates to the server route so the token stays server-side
  // ---------------------------------------------------------------------------

  describe('listBranches', () => {
    const branchesPayload = {
      branches: [{ name: 'main', sha: 'abc123', updatedAt: 1 }],
      hasMore: false,
      endCursor: undefined,
    };

    const mockFetch = (response: Partial<Response>) =>
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- only the fields under test are stubbed
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(response as Response);

    it('should request the server route rather than GitHub directly', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        json: async () => branchesPayload,
      });

      const result = await client.listBranches({ owner: 'taucad', repo: 'tau' });

      expect(result).toStrictEqual(branchesPayload);
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/github-branches?'));
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('owner=taucad'));
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('repo=tau'));
      // The token lives server-side now — the browser must not reach GitHub directly.
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('api.github.com'));
    });

    it('should forward the pagination cursor when provided', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        json: async () => branchesPayload,
      });

      await client.listBranches({ owner: 'o', repo: 'r', cursor: 'cursor-1' });

      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor-1'));
    });

    it('should throw the route error text so the import flow can degrade', async () => {
      mockFetch({
        ok: false,
        text: async () => '401 Unauthorized: GitHub API token is not configured. Branches list unavailable.',
      });

      await expect(client.listBranches({ owner: 'o', repo: 'r' })).rejects.toThrow('Branches list unavailable');
    });
  });
});
