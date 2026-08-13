/**
 * `RenderAbortedError` is internal cooperative-abort plumbing. Its message
 * describes the selection event instead of naming commands because watched
 * filesystem changes can also select a successor preview.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { RenderAbortedError } from '#framework/runtime-worker-client.js';

describe('RenderAbortedError message (R19)', () => {
  it('describes source-agnostic preview supersession', () => {
    const error = new RenderAbortedError();
    expect(error.message).toBe('Render aborted by a newer selected preview');
  });

  it('does not reference the legacy v5 command names (setFile / setParameters)', () => {
    const error = new RenderAbortedError();
    expect(error.message).not.toMatch(/\bsetFile\b/);
    expect(error.message).not.toMatch(/\bsetParameters\b/);
  });
});
