import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import type { RedisService } from '#redis/redis.service.js';
import { branchesQuerySchema } from '#api/repositories/repositories.dto.js';
import { RepositoriesService } from '#api/repositories/repositories.service.js';

const octokitHarness = vi.hoisted(() => ({
  graphql: vi.fn(),
  options: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the package's named class export.
  Octokit: class {
    public readonly graphql = octokitHarness.graphql;

    public constructor(options: unknown) {
      octokitHarness.options(options);
    }
  },
}));

const createService = (token: string | undefined) => {
  const configService = {
    get: vi.fn(() => token),
  } as unknown as ConfigService<Environment, true>;
  const evalRedis = vi.fn().mockResolvedValue(1);
  const redisService = { client: { eval: evalRedis } } as unknown as RedisService;
  return { service: new RepositoriesService(configService, redisService), evalRedis };
};

describe('branchesQuerySchema', () => {
  it('defaults invalid page sizes and clamps large pages to 100', () => {
    expect(branchesQuerySchema.parse({ owner: 'taucad', repo: 'tau', pageSize: 'invalid' }).pageSize).toBe(100);
    expect(branchesQuerySchema.parse({ owner: 'taucad', repo: 'tau', pageSize: '250' }).pageSize).toBe(100);
  });
});

describe('RepositoriesService.listBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts a page by commit date and hoists the default branch on page one', async () => {
    octokitHarness.graphql.mockResolvedValue({
      repository: {
        visibility: 'PUBLIC',
        defaultBranchRef: { name: 'main', target: { oid: 'main-sha', committedDate: '2026-08-01T00:00:00Z' } },
        refs: {
          pageInfo: { hasNextPage: true, endCursor: 'next-page' },
          nodes: [
            { name: 'main', target: { oid: 'main-sha', committedDate: '2026-08-01T00:00:00Z' } },
            { name: 'newer', target: { oid: 'newer-sha', committedDate: '2026-09-01T00:00:00Z' } },
            { name: 'tag-target', target: { oid: 'tag-sha' } },
          ],
        },
      },
    });
    const { service, evalRedis } = createService('github-token');

    await expect(
      service.listBranches({ owner: 'taucad', repo: 'tau', pageSize: 100 }, '203.0.113.7'),
    ).resolves.toStrictEqual({
      branches: [
        { name: 'main', sha: 'main-sha', updatedAt: Date.parse('2026-08-01T00:00:00Z') },
        { name: 'newer', sha: 'newer-sha', updatedAt: Date.parse('2026-09-01T00:00:00Z') },
      ],
      hasMore: true,
      endCursor: 'next-page',
    });
    expect(evalRedis).toHaveBeenCalledWith(expect.any(String), 1, expect.stringContaining('203.0.113.7'), '3600');
    expect(octokitHarness.graphql).toHaveBeenCalledWith(
      expect.stringContaining('defaultBranchRef'),
      expect.objectContaining({ owner: 'taucad', repo: 'tau', first: 100, after: undefined }),
    );
  });

  it('does not request or hoist the default branch after page one', async () => {
    octokitHarness.graphql.mockResolvedValue({
      repository: {
        visibility: 'PUBLIC',
        refs: { pageInfo: { hasNextPage: false, endCursor: undefined }, nodes: [] },
      },
    });
    const { service } = createService('github-token');

    await service.listBranches({ owner: 'taucad', repo: 'tau', pageSize: 25, cursor: 'cursor-1' }, '203.0.113.7');

    expect(octokitHarness.graphql).toHaveBeenCalledWith(
      expect.not.stringContaining('defaultBranchRef'),
      expect.objectContaining({ first: 25, after: 'cursor-1' }),
    );
  });

  it('hides private repositories behind a 404', async () => {
    octokitHarness.graphql.mockResolvedValue({
      repository: {
        visibility: 'PRIVATE',
        refs: { pageInfo: { hasNextPage: false, endCursor: undefined }, nodes: [] },
      },
    });
    const { service } = createService('github-token');

    await expect(
      service.listBranches({ owner: 'private-owner', repo: 'private-repo', pageSize: 100 }, '203.0.113.7'),
    ).rejects.toMatchObject({ status: 404 });
    expect(octokitHarness.graphql).toHaveBeenCalledWith(
      expect.stringContaining('visibility'),
      expect.objectContaining({ owner: 'private-owner', repo: 'private-repo' }),
    );
  });

  it('returns a 401-equivalent error when the API token is absent', async () => {
    const { service } = createService(undefined);

    await expect(service.listBranches({ owner: 'o', repo: 'r', pageSize: 100 }, '203.0.113.7')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps Octokit failures to a bad gateway', async () => {
    octokitHarness.graphql.mockRejectedValue(new Error('GitHub rejected the token'));
    const { service } = createService('github-token');

    await expect(service.listBranches({ owner: 'o', repo: 'r', pageSize: 100 }, '203.0.113.7')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects the 301st branch request from one IP in an hour', async () => {
    const { service, evalRedis } = createService('github-token');
    evalRedis.mockResolvedValue(301);

    await expect(service.listBranches({ owner: 'o', repo: 'r', pageSize: 100 }, '203.0.113.7')).rejects.toMatchObject({
      status: 429,
    });
    expect(octokitHarness.graphql).not.toHaveBeenCalled();
  });
});
