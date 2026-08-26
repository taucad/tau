// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKernel } from '#hooks/use-kernel.js';

const useCookieMock = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-cookie.js', () => ({ useCookie: useCookieMock }));

describe('useKernel', () => {
  beforeEach(() => {
    useCookieMock.mockReset();
  });

  it('heals a cookie holding an engine id rather than a catalog id', () => {
    // `openrscad` is the engine that executes `.scad`, never a catalog id.
    useCookieMock.mockReturnValue(['openrscad', vi.fn()]);

    const { result } = renderHook(() => useKernel());

    expect(result.current.kernel).toBe('openscad');
    expect(result.current.selectedKernel.id).toBe('openscad');
  });
});
