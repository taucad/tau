import { describe, expect, it } from 'vitest';
import { isWorkspaceMutationError, WorkspaceMutationError } from '#workspace-errors.js';

describe('isWorkspaceMutationError', () => {
  it('keeps instanceof support and validates structured-clone brands', () => {
    expect(isWorkspaceMutationError(new WorkspaceMutationError('NAME_EXISTS', '/part.ts'))).toBe(true);
    /* eslint-disable @typescript-eslint/naming-convention -- The fixtures model the public structured-clone brand. */
    expect(isWorkspaceMutationError({ __workspaceMutationError__: true, code: 'NAME_EXISTS' })).toBe(true);
    expect(isWorkspaceMutationError({ __workspaceMutationError__: true, code: 'NOT_A_WORKSPACE_ERROR' })).toBe(false);
    /* eslint-enable @typescript-eslint/naming-convention -- Restore the repository naming convention. */
  });
});
