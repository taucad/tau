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
  it("should leave today's behaviour unchanged with the flag off", () => {
    expect(resolveRememberedKernel({ raw: 'auto', isAutoEnabled: false })).toEqual({
      kernel: 'openscad',
      preference: 'openscad',
      newProjectKernel: 'openscad',
    });
    expect(resolveRememberedKernel({ raw: 'manifold', isAutoEnabled: false })).toEqual({
      kernel: 'manifold',
      preference: 'manifold',
      newProjectKernel: 'manifold',
    });
  });

  it('should remember Auto on Home and preselect replicad on /projects/new with the flag on', () => {
    expect(resolveRememberedKernel({ raw: 'auto', isAutoEnabled: true })).toEqual({
      kernel: 'openscad',
      preference: 'auto',
      newProjectKernel: 'replicad',
    });
  });

  it('should keep a remembered concrete kernel everywhere with the flag on', () => {
    expect(resolveRememberedKernel({ raw: 'jscad', isAutoEnabled: true })).toEqual({
      kernel: 'jscad',
      preference: 'jscad',
      newProjectKernel: 'jscad',
    });
  });

  it('should heal a kernel this runtime cannot run to the default for the flag state', () => {
    expect(resolveRememberedKernel({ raw: 'picogk', isAutoEnabled: true }).preference).toBe('auto');
    expect(resolveRememberedKernel({ raw: 'picogk', isAutoEnabled: false }).preference).toBe('openscad');
  });
});
