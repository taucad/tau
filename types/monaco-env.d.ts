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

  // Web-worker context (`self` inside workers)
  interface WorkerGlobalScope {
    MonacoEnvironment?: Environment;
  }
}

export {};