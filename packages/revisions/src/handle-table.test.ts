import { describe, expect, it } from 'vitest';

import { createHandles } from '#handle-table.js';
import { RevisionPortError } from '#revision-port.js';

describe('createHandles', () => {
  it('should refuse use of the first handle after a 65th concurrent cut evicts it', () => {
    const handles = createHandles<number>('cut');
    const ids = Array.from({ length: 65 }, (_, index) => handles.put(`checkout-${String(index)}`, index));

    expect(handles.take(ids[64]!)).toBe(64);
    let failure: unknown;
    try {
      handles.take(ids[0]!);
      expect.fail('the evicted handle should have been refused');
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(RevisionPortError);
    expect(failure).toMatchObject({ code: 'ENGINE_FAILED', message: 'The cut handle is no longer held.' });
  });
});
