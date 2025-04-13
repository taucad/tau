import type { Environment } from './config.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required for augmentation
  interface Window {
    ENV: Environment;
  }

  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions -- Necessary to augment correctly.
    interface ProcessEnv extends Environment {}
  }
}
