import { describe, expect, it, vi } from 'vitest';
import { createThreeResourceDisposer } from '#resources.js';

describe('Three resource disposal', () => {
  it('disposes shared resources exactly once across repeated retirement', () => {
    const first = { dispose: vi.fn() };
    const shared = { dispose: vi.fn() };
    const dispose = createThreeResourceDisposer([first, shared, shared]);

    dispose();
    dispose();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(shared.dispose).toHaveBeenCalledTimes(1);
  });
});
