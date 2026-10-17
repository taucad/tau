import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMemoryRelease } from '#hooks/use-memory-release.js';

const send = vi.fn();

const render = (options: { readonly constrained: boolean; readonly projectId?: string }) =>
  renderHook(
    ({ projectId }: { projectId?: string }) => {
      useMemoryRelease({ sessions: { send }, focusedProjectId: projectId, constrained: options.constrained });
    },
    { initialProps: { projectId: options.projectId } },
  );

const hide = (): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useMemoryRelease (B-08)', () => {
  afterEach(() => {
    send.mockReset();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('releases every project but the focused one when a constrained page is hidden', () => {
    render({ constrained: true, projectId: 'projA' });
    send.mockReset();

    hide();

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
  });

  it('releases on pagehide as well, since iOS may never fire visibilitychange before a kill', () => {
    render({ constrained: true, projectId: 'projA' });
    send.mockReset();

    globalThis.dispatchEvent(new Event('pagehide'));

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
  });

  it('releases the project left behind when a constrained device navigates away from the editor (D-MEAS-05)', () => {
    const { rerender } = render({ constrained: true, projectId: 'projA' });
    send.mockReset();

    rerender({ projectId: undefined });

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory' });
  });

  it('leaves desktop-class browsers alone: navigation never closes a project there (I22)', () => {
    const { rerender } = render({ constrained: false, projectId: 'projA' });
    rerender({ projectId: undefined });
    hide();
    globalThis.dispatchEvent(new Event('pagehide'));

    expect(send).not.toHaveBeenCalled();
  });
});
