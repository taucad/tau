// @ts-expect-error -- monaco-editor path types
import type { Environment } from 'monaco-editor';

// Extend both Window and Worker global scopes so that assigning
// `self.MonacoEnvironment = { getWorker: ... }` is type-safe in
// both the main thread and web-worker contexts where Monaco may
// execute.

declare global {
  // Browser window context
  interface Window {
    MonacoEnvironment?: Environment;
  }

  // Augment the globalThis type so both browser and worker contexts narrow correctly
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface globalThis {
    MonacoEnvironment?: Environment;
  }
}

export {};