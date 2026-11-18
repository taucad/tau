import type { GithubGistServices } from '@taucad/publish-ui/components/share/github-gist-services';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import {
  awaitGithubGistConnection,
  connectGithubGist,
  getGithubGistConnectionStatus,
  parseGithubGistAuthorizationReturn,
  shareProviderRegistry,
  withBrowserShareProviderContext,
} from '#lib/share-providers.js';

/**
 * The app's Gist services for `@taucad/publish-ui`'s `GithubGistManagement`, rendered through
 * `GithubGistServicesProvider` by the project share panel and the `/s/$slug` route.
 *
 * Each function is late-bound, so a suite that mocks `#lib/share-providers.js` with only the exports it needs can
 * still load this module.
 */
export const githubGistServices: GithubGistServices = {
  awaitGithubGistConnection: async (signal) => awaitGithubGistConnection(signal),
  connectGithubGist: async (input) => connectGithubGist(input),
  getGithubGistConnectionStatus: async () => getGithubGistConnectionStatus(),
  parseGithubGistAuthorizationReturn: (search) => parseGithubGistAuthorizationReturn(search),
  shareProviderRegistry: { load: async (providerId) => shareProviderRegistry.load(providerId) },
  withBrowserShareProviderContext: async (operation) => withBrowserShareProviderContext(operation),
  useAuthLinks,
  useSettingsDialog,
};
