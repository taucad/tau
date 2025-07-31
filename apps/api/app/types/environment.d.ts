import type { Environment } from '#config/environment.config.ts';

declare global {
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions -- Necessary to augment correctly.
    interface ProcessEnv extends Environment {}
  }
}
