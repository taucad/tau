import type { ClientEnvironment } from '#environment.config.js';

declare global {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- required for augmentation
  interface Window {
    // Only the client-safe allowlist is injected — see `clientEnvironmentKeys`.
    ENV: ClientEnvironment;
  }
}
