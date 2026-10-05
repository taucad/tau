import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResizeHandles } from '#components/panes/use-resize-handles.js';
import type { ResizeHandle } from '#components/panes/use-resize-handles.js';

function Harness({
  describeHandle,
  content = 'Ready',
  hasSecondSash = false,
}: {
  readonly describeHandle: (sash: HTMLElement) => ResizeHandle;
  readonly content?: string;
  readonly hasSecondSash?: boolean;
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  useResizeHandles(rootRef, describeHandle);
  return (
    <div ref={rootRef} data-resize-owner>
      <div className='sash' />
      {hasSecondSash ? <div className='sash' /> : null}
      <button type='button' className={content} style={{ width: content.length }}>
        {content}
      </button>
      <div data-resize-owner>
        <div className='sash' />
      </div>
    </div>
  );
}

const deliverMutations = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(20);
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useResizeHandles', () => {
  it('should ignore content changes while retaining dynamic and keyboard resize semantics', async () => {
    vi.useFakeTimers();
    let value = 200;
    const resize = vi.fn((next: number) => {
      value = next;
    });
    const describeHandle = vi.fn(
      (): ResizeHandle => ({
        label: 'Resize editor panes',
        orientation: 'vertical',
        minimum: 100,
        maximum: 400,
        value,
        resize,
      }),
    );
    const { rerender } = render(<Harness describeHandle={describeHandle} />);
    await deliverMutations();
    const sash = screen.getByRole('separator', { name: 'Resize editor panes' });
    expect(sash).toHaveAttribute('aria-valuenow', '200');
    describeHandle.mockClear();

    rerender(<Harness describeHandle={describeHandle} content='Streaming response with updated styling' />);
    await deliverMutations();
    expect(describeHandle).not.toHaveBeenCalled();

    fireEvent.keyDown(sash, { key: 'ArrowRight' });
    await deliverMutations();
    expect(resize).toHaveBeenLastCalledWith(208);
    expect(sash).toHaveAttribute('aria-valuenow', '208');

    rerender(<Harness describeHandle={describeHandle} hasSecondSash />);
    await deliverMutations();
    expect(screen.getAllByRole('separator', { name: 'Resize editor panes' })).toHaveLength(2);

    rerender(<Harness describeHandle={describeHandle} />);
    await deliverMutations();
    expect(screen.getAllByRole('separator', { name: 'Resize editor panes' })).toHaveLength(1);

    value = 250;
    sash.style.left = '250px';
    await deliverMutations();
    expect(sash).toHaveAttribute('aria-valuenow', '250');
    sash.classList.add('sash-disabled');
    await deliverMutations();
    expect(sash).toHaveAttribute('aria-disabled', 'true');
    expect(sash).toHaveAttribute('tabindex', '-1');
  });
});
