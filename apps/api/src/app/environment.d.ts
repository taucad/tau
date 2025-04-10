import { Environment } from './config';

declare global {
  namespace NodeJS {
    // eslint-disable-next-line unicorn/prevent-abbreviations, @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- Necessary to augment correctly.
    interface ProcessEnv extends Environment {}
  }
}
