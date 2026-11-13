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

it('should be hidden at 999 ms and shown from 1,000 ms after the wait started', () => {
  renderAt(0, { active: true, label: 'Loading chat' });

  seek(999);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
  seek(1000 + 150);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(getComputedStyle(find('wait-indicator-body')).opacity).toBe('1');
});

it('should keep its geometry from the start of the wait, so the reveal moves nothing', () => {
  renderAt(0, { active: true, label: 'Loading chat' });
  seek(0);
  const before = boxOf(find('wait-indicator'));
  seek(1200);
  const after = boxOf(find('wait-indicator'));

  expect(after).toEqual(before);
});

it('should swap to the slow words and Retry at 10,000 ms without changing its box', () => {
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

it('should keep the slow words hidden while the indicator itself is still hidden', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat' });

  seek(500);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);
});

it('should hold the indicator to 1,500 ms when content arrives at 1,100 ms', () => {
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

it('should start a new wait hidden when a Retry comes after the indicator served its minimum', () => {
  const view = renderAt(11_000, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat', startedAt: 0 });
  view.rerender(
    <WaitClockProvider clock={clockAt(11_600)}>
      <WaitIndicator active label='Loading chat' slowLabel='Still loading chat' startedAt={11_600} />
    </WaitClockProvider>,
  );

  seek(999);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
  seek(1000 + 150);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(isShown(find('wait-indicator-label'))).toBe(true);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);
});

it('should keep the slow words and Retry visible through a hold that starts after the slow mark', () => {
  const props = { label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined, startedAt: 0 };
  const view = renderAt(9800, { ...props, active: true });
  view.rerender(
    <WaitClockProvider clock={clockAt(10_100)}>
      <WaitIndicator {...props} active={false} />
    </WaitClockProvider>,
  );

  seek(100);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(true);
  seek(201);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
});

it('should keep a Retry indicator visible through the new wait start', () => {
  const props = { label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined };
  const view = renderAt(10_100, { ...props, active: true, startedAt: 0 });
  view.rerender(
    <WaitClockProvider clock={clockAt(10_300)}>
      <WaitIndicator {...props} active startedAt={10_300} />
    </WaitClockProvider>,
  );

  seek(0);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(getComputedStyle(find('wait-indicator-body')).opacity).toBe('1');
});
