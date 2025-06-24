/* eslint-disable @typescript-eslint/consistent-type-definitions -- required for module augmentation */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- top level imports are not allowed
/// <reference types="vite/client" />

interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly TODO_ADD_ENV_VARS: string;
  // More env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
