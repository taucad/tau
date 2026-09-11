import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleQueryError } from '#root.js';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { error: toastError } }));

describe('handleQueryError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should not toast an error owned by its query', () => {
    handleQueryError(
      { error: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' } },
      { handlesErrorLocally: true },
    );

    expect(toastError).not.toHaveBeenCalled();
  });

  it('should toast an unhandled auth query error', () => {
    handleQueryError({ error: { code: 'UNKNOWN', message: 'Unhandled auth error' } }, undefined);

    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith('Unhandled auth error');
  });
});
