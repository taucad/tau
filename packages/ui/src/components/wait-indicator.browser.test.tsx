import '#components/select.browser.css';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WaitIndicator } from '#components/wait-indicator.js';
import { WaitClockProvider } from '#hooks/use-wait-clock.js';
import type { WaitIndicatorProps } from '#components/wait-indicator.js';

afterEach(() => {
  cleanup();
});

const clockAt = (time: number) => ({ now: () => time });

const find = (slot: string): HTMLElement => document.querySelector<HTMLElement>(`[data-slot=${slot}]`)!;

/**
 * Pauses every running animation and moves it to `time` ms after it started, as if that much time had passed. A swap
 * is a 0.01 ms step that ends just after its mark, so the rows below look 1 ms past each mark.
 */
function seek(time: number): void {
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = time;
  }
}

/** A box as plain numbers, comparable with `toEqual`. */
const boxOf = (element: Element): readonly number[] => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return [x, y, width, height];
};

const isShown = (element: Element): boolean => getComputedStyle(element).visibility === 'visible';

function renderAt(time: number, props: WaitIndicatorProps) {
  return render(
    <WaitClockProvider clock={clockAt(time)}>
      <WaitIndicator {...props} />
    </WaitClockProvider>,
  );
}

it('is hidden at 999 ms and shown from 1,000 ms after the wait started', () => {
  renderAt(0, { active: true, label: 'Loading chat' });

  seek(999);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
  seek(1000 + 150);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(getComputedStyle(find('wait-indicator-body')).opacity).toBe('1');
});

it('keeps its geometry from the start of the wait, so the reveal moves nothing', () => {
  renderAt(0, { active: true, label: 'Loading chat' });
  seek(0);
  const before = boxOf(find('wait-indicator'));
  seek(1200);
  const after = boxOf(find('wait-indicator'));

  expect(after).toEqual(before);
});

it('swaps to the slow words and Retry at 10,000 ms without changing its box', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined });

  seek(9999);
  const box = boxOf(find('wait-indicator'));
  expect(isShown(find('wait-indicator-label'))).toBe(true);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);

  seek(10_001);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(true);
  expect(boxOf(find('wait-indicator'))).toEqual(box);
});

it('keeps the slow words hidden while the indicator itself is still hidden', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat' });

  seek(500);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);
});

it('holds the indicator to 1,500 ms when content arrives at 1,100 ms', () => {
  const view = renderAt(0, { active: true, label: 'Loading chat' });
  view.rerender(
    <WaitClockProvider clock={clockAt(1100)}>
      <WaitIndicator active={false} label='Loading chat' />
    </WaitClockProvider>,
  );

  seek(399);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  seek(401);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
});
