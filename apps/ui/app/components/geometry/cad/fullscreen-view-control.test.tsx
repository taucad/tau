// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FullscreenViewControl } from '#components/geometry/cad/fullscreen-view-control.js';

let fullscreenElement: Element | undefined;
const changeFullscreen = (element: Element | undefined): void => {
  fullscreenElement = element;
  document.dispatchEvent(new Event('fullscreenchange'));
};

beforeEach(() => {
  fullscreenElement = undefined;
  Object.defineProperties(document, {
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    fullscreenEnabled: { configurable: true, value: true },
    exitFullscreen: {
      configurable: true,
      value: vi.fn(async () => {
        changeFullscreen(undefined);
      }),
    },
  });
});

afterEach(() => {
  for (const property of ['fullscreenElement', 'fullscreenEnabled', 'exitFullscreen']) {
    Reflect.deleteProperty(document, property);
  }
  vi.restoreAllMocks();
});

const renderViewer = () => {
  const result = render(
    <TooltipProvider>
      <div data-viewer-frame role='img' aria-label='Model viewer'>
        <canvas aria-label='Model canvas' />
        <FullscreenViewControl />
      </div>
    </TooltipProvider>,
  );
  const viewer = screen.getByRole('img', { name: 'Model viewer' });
  const requestFullscreen = vi.fn(async () => {
    changeFullscreen(viewer);
  });
  Object.defineProperty(viewer, 'requestFullscreen', { configurable: true, value: requestFullscreen });
  return { ...result, viewer, requestFullscreen };
};

describe('FullscreenViewControl', () => {
  it('should fullscreen only its viewer, preserve the canvas, and follow button and native exits', async () => {
    const user = userEvent.setup();
    const { viewer, requestFullscreen } = renderViewer();
    const canvas = screen.getByLabelText('Model canvas');

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen', pressed: false }));

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBe(viewer);
    expect(screen.getByLabelText('Model canvas')).toBe(canvas);
    await user.click(screen.getByRole('button', { name: 'Exit fullscreen', pressed: true }));
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Enter fullscreen', pressed: false })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    act(() => {
      changeFullscreen(undefined);
    });
    expect(screen.getByRole('button', { name: 'Enter fullscreen', pressed: false })).toBeEnabled();
    expect(screen.getByLabelText('Model canvas')).toBe(canvas);
  });

  it('should report rejected requests and let the user retry', async () => {
    const user = userEvent.setup();
    const { requestFullscreen } = renderViewer();
    requestFullscreen.mockRejectedValueOnce(new TypeError('Permission denied'));

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to change fullscreen. Try again.');
    expect(screen.getByRole('button', { name: 'Enter fullscreen', pressed: false })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit fullscreen', pressed: true })).toBeEnabled();
  });

  it('should explain when native fullscreen is unavailable', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const user = userEvent.setup();
    const { requestFullscreen } = renderViewer();

    await user.click(screen.getByRole('button', { name: 'Enter fullscreen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Fullscreen is unavailable here.');
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it('should remove its native fullscreen subscription on unmount', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderViewer();
    unmount();
    expect(removeListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
  });
});
