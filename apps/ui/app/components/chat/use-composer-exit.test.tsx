// @vitest-environment jsdom
import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { focusTrapAttribute, useComposerExit } from '#components/chat/use-composer-exit.js';

function Composer({
  onExit,
  isSurfaceOpen,
  isSurfaceClosing = false,
}: {
  readonly onExit: () => void;
  readonly isSurfaceOpen: boolean;
  readonly isSurfaceClosing?: boolean;
}): React.JSX.Element {
  const containerReference = useRef<HTMLDivElement>(null);
  const { handleBlur } = useComposerExit({ containerReference, onExit });
  return (
    <>
      <div ref={containerReference} data-chat-composer='edit' onBlur={handleBlur}>
        <input aria-label='Edit your message' />
        <button type='button'>Select kernel</button>
      </div>
      {isSurfaceOpen ? (
        <div {...{ [focusTrapAttribute]: '' }}>
          <input aria-label='Search kernels' />
        </div>
      ) : null}
      {/* A surface stays mounted, marked closed, while its close animation runs. */}
      {isSurfaceClosing ? <div data-state='closed' {...{ [focusTrapAttribute]: '' }} /> : null}
      {/* The chat's main composer marks its own triggers, which are not open surfaces. */}
      <div data-chat-composer='main'>
        <button type='button' {...{ [focusTrapAttribute]: '' }}>
          Main agent and model
        </button>
      </div>
      <button type='button'>Elsewhere</button>
      <input aria-label='Other field' />
    </>
  );
}

const nextFrame = async (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const renderComposer = ({ isSurfaceOpen = false } = {}): {
  onExit: ReturnType<typeof vi.fn>;
  rerender: (isOpen: boolean) => void;
} => {
  const onExit = vi.fn();
  const { rerender } = render(<Composer onExit={onExit} isSurfaceOpen={isSurfaceOpen} />);
  screen.getByRole('textbox', { name: 'Edit your message' }).focus();
  return {
    onExit,
    rerender(isOpen) {
      rerender(<Composer onExit={onExit} isSurfaceOpen={isOpen} />);
    },
  };
};

/** WebKit focuses nothing for a pressed button: the editor blurs and focus falls to the body. */
const pressAsWebKit = (element: HTMLElement): void => {
  fireEvent.pointerDown(element);
  (document.activeElement as HTMLElement).blur();
  fireEvent.pointerUp(element);
  fireEvent.click(element);
};

describe('useComposerExit', () => {
  it('should report leaving when focus moves to a field outside the composer', async () => {
    const { onExit } = renderComposer();
    screen.getByRole('textbox', { name: 'Other field' }).focus();
    await nextFrame();

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should stay when focus moves into UI marked as the composer’s own', async () => {
    const { onExit } = renderComposer({ isSurfaceOpen: true });
    screen.getByRole('textbox', { name: 'Search kernels' }).focus();
    await nextFrame();

    expect(onExit).not.toHaveBeenCalled();
  });

  it('should stay when a pressed control inside takes no focus, as in WebKit', async () => {
    const { onExit } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    await nextFrame();

    expect(onExit).not.toHaveBeenCalled();
  });

  it('should report leaving on the next press outside after such a press', async () => {
    const { onExit } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    await nextFrame();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should report leaving when focus later lands on a field outside after such a press', async () => {
    const { onExit } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    await nextFrame();
    screen.getByRole('textbox', { name: 'Other field' }).focus();

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should keep the edit when a press inside is followed by focus inside a marked surface', async () => {
    const { onExit, rerender } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    rerender(true);
    await nextFrame();
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Search kernels' }));
    screen.getByRole('textbox', { name: 'Search kernels' }).focus();

    expect(onExit).not.toHaveBeenCalled();
  });

  it('should keep the edit when a press outside dismisses its open surface, and leave on the next', async () => {
    const { onExit, rerender } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    rerender(true);
    await nextFrame();
    // A tap on the drawer's overlay closes the drawer, not the edit.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onExit).not.toHaveBeenCalled();

    rerender(false);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should report leaving on a press outside while a dismissed surface animates closed', async () => {
    const onExit = vi.fn();
    const { rerender } = render(<Composer onExit={onExit} isSurfaceOpen={false} />);
    screen.getByRole('textbox', { name: 'Edit your message' }).focus();
    pressAsWebKit(screen.getByRole('button', { name: 'Select kernel' }));
    rerender(<Composer isSurfaceClosing onExit={onExit} isSurfaceOpen={false} />);
    await nextFrame();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should report leaving when a press outside drops focus to the body', async () => {
    const { onExit } = renderComposer();
    pressAsWebKit(screen.getByRole('button', { name: 'Elsewhere' }));
    await nextFrame();

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
