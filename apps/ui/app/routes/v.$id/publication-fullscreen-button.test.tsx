import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { PublicationFullscreenButton, usePublicationFullscreen } from '#routes/v.$id/publication-fullscreen-button.js';

const Harness = (): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = usePublicationFullscreen(ref);
  return (
    <TooltipProvider>
      <div ref={ref} data-testid='fullscreen-target' />
      <PublicationFullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />
    </TooltipProvider>
  );
};

const requestFullscreen = vi.fn(async () => undefined);
const exitFullscreen = vi.fn(async () => undefined);

const setFullscreenElement = (node: Element | undefined): void => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => node ?? null,
  });
};

beforeEach(() => {
  requestFullscreen.mockClear();
  exitFullscreen.mockClear();
  // oxlint-disable-next-line no-extend-native -- we extend Element on the prototype to stub the Fullscreen API in jsdom
  Element.prototype.requestFullscreen = requestFullscreen as unknown as Element['requestFullscreen'];
  document.exitFullscreen = exitFullscreen as unknown as typeof document.exitFullscreen;
  setFullscreenElement(undefined);
});

afterEach(() => {
  setFullscreenElement(undefined);
});

describe('PublicationFullscreenButton', () => {
  it('calls requestFullscreen on the target element when clicked while not fullscreen', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /fullscreen/iu }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it('flips the aria-label and calls exitFullscreen after a fullscreenchange event', async () => {
    render(<Harness />);
    const target = screen.getByTestId('fullscreen-target');

    setFullscreenElement(target);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    const exitButton = screen.getByRole('button', { name: /exit fullscreen/iu });
    await userEvent.click(exitButton);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
