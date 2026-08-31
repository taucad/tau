import { Octokit } from '@octokit/rest';
import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * Branch node from the GraphQL response.
 */
type BranchNode = {
  name: string;
  target: {
    oid: string;
    committedDate?: string;
  };
};

/**
 * GraphQL response for the branches query. The `defaultBranchRef` selection is
 * only present on the first page (no cursor).
 */
type BranchesGraphqlResponse = {
  repository: {
    defaultBranchRef?: {
      name: string;
      target: {
        oid: string;
        committedDate?: string;
      };
    };
    refs: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | undefined;
      };
      nodes: BranchNode[];
    };
  };
};

export type GithubBranchesResponse = {
  readonly branches: ReadonlyArray<{ name: string; sha: string; updatedAt: number }>;
  readonly hasMore: boolean;
  readonly endCursor: string | undefined;
};

const defaultPageSize = 100;

const branchesQuery = (includeDefaultBranch: boolean): string => `
  query($owner: String!, $repo: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      ${
        includeDefaultBranch
          ? `defaultBranchRef {
              name
              target {
                ... on Commit {
                  oid
                  committedDate
                }
              }
            }`
          : ''
      }
      refs(refPrefix: "refs/heads/", first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          target {
            ... on Commit {
              oid
              committedDate
            }
          }
        }
      }
    }
  }
`;

/**
 * Branch listing for a GitHub repository, keeping the GitHub token server-side.
 *
 * GitHub's GraphQL API rejects unauthenticated requests outright, so this route
 * only returns branches when `GITHUB_API_TOKEN` is configured. Without it the
 * route reports the same "Branches list unavailable" failure the client used to
 * raise itself, and the import flow degrades to the default branch.
 *
 * Usage: `GET /api/github-branches?owner=taucad&repo=tau&pageSize=100&cursor=…`
 */
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');

  if (!owner || !repo) {
    return new Response('Missing required parameters: owner, repo', { status: 400 });
  }

  const cursor = url.searchParams.get('cursor') ?? undefined;
  const parsedPageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '', 10);
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, defaultPageSize)
      : defaultPageSize;

  const environment = await getEnvironment();
  const token = environment.GITHUB_API_TOKEN;

  if (!token) {
    return new Response('401 Unauthorized: GitHub API token is not configured. Branches list unavailable.', {
      status: 401,
    });
  }

  const isFirstPage = cursor === undefined;
  const octokit = new Octokit({ auth: token, userAgent: metaConfig.userAgent });

  let response: BranchesGraphqlResponse;
  try {
    response = await octokit.graphql<BranchesGraphqlResponse>(branchesQuery(isFirstPage), {
      owner,
      repo,
      first: pageSize,
      after: cursor,
    });
  } catch (error) {
    console.error('Failed to list GitHub branches:', error);
    return new Response('401 Unauthorized: GitHub API token is invalid or expired. Branches list unavailable.', {
      status: 502,
    });
  }

  const hasCommittedDate = (
    node: BranchNode,
  ): node is BranchNode & { target: { oid: string; committedDate: string } } => node.target.committedDate !== undefined;

  // Sort within the page by commit date (most recent first). Cross-page sorting
  // is not possible: GitHub's TAG_COMMIT_DATE ordering only applies to tags.
  const branches = response.repository.refs.nodes
    .filter((node) => hasCommittedDate(node))
    .map((node) => ({
      name: node.name,
      sha: node.target.oid,
      updatedAt: new Date(node.target.committedDate).getTime(),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  // On the first page, hoist the default branch to the front.
  if (isFirstPage && response.repository.defaultBranchRef) {
    const defaultBranchName = response.repository.defaultBranchRef.name;
    const defaultBranchIndex = branches.findIndex((branch) => branch.name === defaultBranchName);
    if (defaultBranchIndex > 0) {
      const defaultBranch = branches[defaultBranchIndex];
      if (defaultBranch) {
        branches.splice(defaultBranchIndex, 1);
        branches.unshift(defaultBranch);
      }
    }
  }

  return Response.json({
    branches,
    hasMore: response.repository.refs.pageInfo.hasNextPage,
    endCursor: response.repository.refs.pageInfo.endCursor,
  } satisfies GithubBranchesResponse);
}
