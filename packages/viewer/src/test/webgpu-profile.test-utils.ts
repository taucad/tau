import type { RendererOutputProfile } from '@taucad/runtime-testing/browser/three-renderer-output';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext is augmented through interface merging.
  interface ProvidedContext {
    webGpuProfile: RendererOutputProfile;
  }
}
