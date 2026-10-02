import { createAuthPlugin } from '@better-auth-ui/core';
import { apiKeyPlugin as coreApiKeyPlugin } from '@better-auth-ui/core/plugins';
import type { ApiKeyPluginOptions } from '@better-auth-ui/core/plugins';

// API keys live in their own settings tab (`settings-dialog.tsx` → "API Keys"),
// so we deliberately omit the `securityCards` contribution to avoid rendering
// the same card a second time inside the Security tab.
export const apiKeyPlugin = createAuthPlugin(coreApiKeyPlugin.id, (options: ApiKeyPluginOptions = {}) => ({
  ...coreApiKeyPlugin(options),
}));
