import '#styles/global.css';
import { act, cleanup, render, screen } from '@testing-library/react';
import { forwardRef, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ScrollerProps, VirtuosoHandle } from 'react-virtuoso';
import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { useFollowLatestOutput } from '#routes/w.$workspace.$project/use-follow-latest-output.js';

afterEach(cleanup);

const turns = ['first', 'second', 'streaming'];
let appendLine: () => void = () => undefined;

const components = {
  Scroller: forwardRef<HTMLDivElement, ScrollerProps>(function (props, ref) {
    return <div {...props} ref={ref} data-testid='scroller' />;
  }),
};

// The streaming turn grows from its own state, as a chat row does from its
// store subscription, so Virtuoso itself never re-renders while it streams.
function StreamingTurn(): React.JSX.Element {
  const [lines, setLines] = useState(40);
  const [isOpen, setIsOpen] = useState(false);
  appendLine = () => {
    setLines((count) => count + 5);
  };
  return (
    <div>
      {Array.from({ length: lines }, (_, line) => (
        <p key={line}>streaming line {line}</p>
      ))}
      <button
        type='button'
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        Ran commands
      </button>
      {isOpen ? <div style={{ height: 240 }}>rows</div> : undefined}
    </div>
  );
}

const renderTurn = (index: number, turn: string): React.JSX.Element =>
  index === turns.length - 1 ? (
    <StreamingTurn />
  ) : (
    <div>
      {Array.from({ length: 20 }, (_, line) => (
        <p key={line}>
          {turn} line {line}
        </p>
      ))}
    </div>
  );

function StreamingTranscript(): React.JSX.Element {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const follow = useFollowLatestOutput(virtuosoRef);
  return (
    <Virtuoso
      ref={virtuosoRef}
      data={turns}
      style={{ height: 300 }}
      initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
      scrollerRef={follow.scrollerRef}
      followOutput={follow.followOutput}
      totalListHeightChanged={follow.totalListHeightChanged}
      components={components}
      itemContent={renderTurn}
    />
  );
}

const nextFrames = async (): Promise<void> => {
  for (let frame = 0; frame < 4; frame++) {
    // oxlint-disable-next-line no-await-in-loop -- frames must elapse in order
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }
};

const distanceFromBottom = (scroller: HTMLElement): number =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

const grow = async (): Promise<void> => {
  act(() => {
    appendLine();
  });
  await nextFrames();
};

it('follows a last turn that grows in place only while pinned to the bottom', async () => {
  render(<StreamingTranscript />);
  const scroller = screen.getByTestId('scroller');
  // Virtuoso renders and settles its initial bottom position over several frames.
  await expect.poll(() => scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
  // Virtuoso itself follows size increases only briefly after its own props
  // change; a reasoning stream keeps growing its row long after that.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });

  await grow();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
  await grow();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);

  scroller.scrollTop -= 200;
  await nextFrames();
  const readingPosition = scroller.scrollTop;
  await grow();
  expect(scroller.scrollTop).toBe(readingPosition);
  expect(distanceFromBottom(scroller)).toBeGreaterThan(4);

  scroller.scrollTop = scroller.scrollHeight;
  await nextFrames();
  await grow();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
});

it('keeps a disclosure where the person clicked it and resumes following once it is closed', async () => {
  render(<StreamingTranscript />);
  const scroller = screen.getByTestId('scroller');
  await expect.poll(() => scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });

  const trigger = screen.getByRole('button', { name: 'Ran commands' });
  const restingTop = trigger.getBoundingClientRect().top;
  await userEvent.click(trigger);
  await nextFrames();
  // The rows open below the line; the line itself does not move, so the list is no longer at its bottom.
  expect(trigger.getBoundingClientRect().top).toBe(restingTop);
  expect(distanceFromBottom(scroller)).toBeGreaterThan(200);

  // Output that arrives while the person inspects does not take the view either.
  const inspectingPosition = scroller.scrollTop;
  await grow();
  expect(scroller.scrollTop).toBe(inspectingPosition);

  // Closing returns the list to its bottom without a scroll event of the person's; following resumes.
  scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight - 240;
  await nextFrames();
  await userEvent.click(trigger);
  await nextFrames();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
  await grow();
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(4);
});
