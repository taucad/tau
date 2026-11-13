// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRememberedKernel, useKernel } from '#hooks/use-kernel.js';

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

describe('resolveRememberedKernel (blueprint E4, E5)', () => {
  it('should remember Auto on Home and preselect replicad on /projects/new', () => {
    expect(resolveRememberedKernel({ raw: 'auto' })).toEqual({
      kernel: 'openscad',
      preference: 'auto',
      newProjectKernel: 'replicad',
    });
  });

  it('should keep a remembered concrete kernel everywhere', () => {
    expect(resolveRememberedKernel({ raw: 'jscad' })).toEqual({
      kernel: 'jscad',
      preference: 'jscad',
      newProjectKernel: 'jscad',
    });
  });

  it('should heal a kernel this runtime cannot run to Auto', () => {
    expect(resolveRememberedKernel({ raw: 'picogk' }).preference).toBe('auto');
  });
});
