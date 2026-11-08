import type { Environment } from '@taucad/api-core';

declare global {
  namespace NodeJS {
    // oxlint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions -- Necessary to augment correctly.
    interface ProcessEnv extends Environment {}
  }
}
