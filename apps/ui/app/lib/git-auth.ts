import { authClient } from '#lib/auth-client.js';

/**
 * GitHub Repository Access Scopes
 *
 * These scopes are required for full repository access:
 * - repo: Full control of private repositories (includes read/write)
 * - public_repo: Access to public repositories (if you only need public repos)
 */
export const githubRepoScopes = ['repo'];

/**
 * Request GitHub repository access permissions
 *
 * This function initiates an OAuth flow to request additional GitHub scopes
 * for repository access. It should be called when the user wants to connect
 * their build to a Git repository.
 *
 * @returns Promise that resolves when the OAuth flow completes
 * @throws Error if the OAuth flow fails or is cancelled by the user
 *
 * @example
 * ```typescript
 * try {
 *   await requestGitHubRepoAccess();
 *   // User has granted repository access
 * } catch (error) {
 *   // User denied or error occurred
 * }
 * ```
 */
export async function requestGitHubRepoAccess(): Promise<void> {
  // Use linkSocial to request additional scopes
  // Better Auth will handle the OAuth flow and return to the current page
  await authClient.linkSocial({
    provider: 'github',
    scopes: githubRepoScopes,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth naming convention
    callbackURL: globalThis.location.href, // Return to current page after OAuth
  });
}

/**
 * Get the GitHub access token for the authenticated user
 *
 * This retrieves the OAuth access token that can be used for Git operations
 * and GitHub API calls.
 *
 * @returns Promise containing the access token
 * @throws Error if not authenticated or token retrieval fails
 */
export async function getGitHubAccessToken(): Promise<string> {
  try {
    const tokenData = await authClient.getAccessToken({
      providerId: 'github',
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tokenData can be null
    if (!tokenData) {
      throw new Error('No GitHub account linked. Please link your GitHub account in Settings first.');
    }

    // Handle the discriminated union type from better-auth
    if (tokenData.error) {
      throw new Error(tokenData.error.message ?? 'Failed to get access token');
    }

    const { accessToken } = tokenData.data;

    if (!accessToken) {
      throw new Error('No access token available. Please try linking your GitHub account again.');
    }

    return accessToken;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Failed to retrieve GitHub access token. You may not be signed in or have not linked your GitHub account.',
    );
  }
}

/**
 * Check if the user has granted GitHub repository access
 *
 * @returns true if the user has repository access, false otherwise
 */
export async function hasGitHubRepoAccess(): Promise<boolean> {
  const token = await getGitHubAccessToken();

  // Try to fetch user repos to verify we have the repo scope
  const response = await fetch('https://api.github.com/user/repos?per_page=1', {
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub API format
      Authorization: `Bearer ${token}`,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub API format
      Accept: 'application/vnd.github.v3+json',
    },
  });

  // If we get 401/403, we don't have proper permissions
  // If we get 200, we have repo access
  return response.ok;
}
