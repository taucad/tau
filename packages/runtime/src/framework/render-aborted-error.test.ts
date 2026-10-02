/**
 * `RenderAbortedError` is internal cooperative-abort plumbing. Its message
 * describes the document operation instead of naming transport commands.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { RenderAbortedError } from '#framework/runtime-operation-errors.js';

describe('RenderAbortedError message', () => {
  it('describes document-operation supersession', () => {
    const error = new RenderAbortedError();
    expect(error.message).toBe('Render aborted by a superseding document operation');
  });

  it('does not reference the legacy v5 command names (setFile / setParameters)', () => {
    const error = new RenderAbortedError();
    expect(error.message).not.toMatch(/\bsetFile\b/);
    expect(error.message).not.toMatch(/\bsetParameters\b/);
  });
});
