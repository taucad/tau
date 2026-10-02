import type * as Monaco from 'monaco-editor';

/**
 * Monaco's `CancellationToken.None` is not always defined when importing `monaco-editor`
 * in Vitest; use this for provider tests.
 */
export function createTestCancellationToken(): Monaco.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  };
}
