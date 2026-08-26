import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * Star count for the Tau repository. Omitted (undefined) when GitHub is
 * unavailable, so the client degrades to a plain icon.
 */
export type GithubStarsResponse = {
  readonly stars: number | undefined;
};

const githubApiUrl = `https://api.github.com/repos/${metaConfig.githubOwner}/${metaConfig.githubRepo}`;

/**
 * Proxy route for the Tau repository star count. Keeps the (optional) GitHub
 * token server-side and shields the client from GitHub rate limits with a long
 * edge cache. Always resolves to JSON `{ stars }`; on any upstream failure it
 * omits the count so the nav degrades to a plain icon rather than erroring.
 *
 * Usage: `GET /api/github-stars`
 */
export async function loader(_args: Route.LoaderArgs): Promise<Response> {
  const headers = new Headers();
  headers.set('User-Agent', metaConfig.userAgent);
  headers.set('Accept', 'application/vnd.github+json');

  try {
    const environment = await getEnvironment();
    if (environment.GITHUB_API_TOKEN) {
      headers.set('Authorization', `Bearer ${environment.GITHUB_API_TOKEN}`);
    }
  } catch {
    // Environment not available, continue unauthenticated.
  }

  try {
    const response = await fetch(githubApiUrl, { headers, redirect: 'follow' });
    if (!response.ok) {
      return jsonStars(undefined, 60);
    }

    const body = (await response.json()) as { stargazers_count?: unknown };
    const stars = typeof body.stargazers_count === 'number' ? body.stargazers_count : undefined;
    return jsonStars(stars, 3600);
  } catch (error) {
    console.error('Failed to fetch GitHub stars:', error);
    return jsonStars(undefined, 60);
  }
}

function jsonStars(stars: number | undefined, maxAgeSeconds: number): Response {
  return Response.json({ stars } satisfies GithubStarsResponse, {
    headers: {
      'Cache-Control': `public, max-age=${maxAgeSeconds}, stale-while-revalidate=604800`,
    },
  });
}
