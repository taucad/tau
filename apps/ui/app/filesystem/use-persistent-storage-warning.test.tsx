import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refusal = vi.hoisted(() => ({ refused: false, listeners: new Set<() => void>() }));
const mockClaim = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const mockToastWarning = vi.hoisted(() => vi.fn());

vi.mock('#filesystem/handle-store.js', () => ({
  isPersistentStorageRefused: () => refusal.refused,
  subscribePersistentStorageRefusal: (listener: () => void) => {
    refusal.listeners.add(listener);
    return () => {
      refusal.listeners.delete(listener);
    };
  },
  claimPersistentStorageWarning: mockClaim,
}));
vi.mock('sonner', () => ({ toast: { warning: mockToastWarning } }));

const { persistentStorageWarning, usePersistentStorageWarning } =
  await import('#filesystem/use-persistent-storage-warning.js');

const refuse = (): void => {
  refusal.refused = true;
  for (const listener of refusal.listeners) {
    listener();
  }
};

describe('usePersistentStorageWarning', () => {
  beforeEach(() => {
    refusal.refused = false;
    refusal.listeners.clear();
    mockClaim.mockReset();
    mockToastWarning.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should say what a refused request risks, once the browser refuses (R14)', async () => {
    mockClaim.mockResolvedValue(true);
    renderHook(() => {
      usePersistentStorageWarning();
    });
    expect(mockToastWarning).not.toHaveBeenCalled();

    refuse();

    await waitFor(() => {
      expect(mockToastWarning).toHaveBeenCalledOnce();
    });
    expect(mockToastWarning).toHaveBeenCalledWith('This browser may clear your Home projects', {
      description: persistentStorageWarning.description,
      duration: Number.POSITIVE_INFINITY,
    });
    expect(persistentStorageWarning.description).toMatch(/may delete it when space runs low/u);
  });

  it('should stay quiet once this profile has been warned', async () => {
    refusal.refused = true;
    mockClaim.mockResolvedValue(false);

    renderHook(() => {
      usePersistentStorageWarning();
    });

    await waitFor(() => {
      expect(mockClaim).toHaveBeenCalled();
    });
    expect(mockToastWarning).not.toHaveBeenCalled();
  });

  it('should not warn while persistence is granted or unknown', () => {
    renderHook(() => {
      usePersistentStorageWarning();
    });

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockToastWarning).not.toHaveBeenCalled();
  });

  it('should not warn on desktop, where Home is a folder on disk', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    refusal.refused = true;

    renderHook(() => {
      usePersistentStorageWarning();
    });

    expect(mockClaim).not.toHaveBeenCalled();
  });
});
