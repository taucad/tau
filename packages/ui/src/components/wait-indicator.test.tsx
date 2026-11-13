import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WaitIndicator } from '#components/wait-indicator.js';
import { WaitClockProvider } from '#hooks/use-wait-clock.js';
import type { WaitIndicatorProps } from '#components/wait-indicator.js';

/** A clock that only moves when the test moves it. */
function createTestClock(start = 0): { now: () => number; set: (time: number) => void } {
  let time = start;
  return {
    now: () => time,
    set(next) {
      time = next;
    },
  };
}

function renderWithClock(clock: { now: () => number }, props: WaitIndicatorProps) {
  const view = render(
    <WaitClockProvider clock={clock}>
      <WaitIndicator {...props} />
    </WaitClockProvider>,
  );
  return {
    ...view,
    rerenderWith(next: Partial<WaitIndicatorProps>) {
      view.rerender(
        <WaitClockProvider clock={clock}>
          <WaitIndicator {...props} {...next} />
        </WaitClockProvider>,
      );
    },
  };
}

const slot = (): HTMLElement => document.querySelector<HTMLElement>('[data-slot=wait-indicator]')!;
const body = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('[data-slot=wait-indicator-body]') ?? undefined;

describe('WaitIndicator', () => {
  it('should keep an empty status slot in the DOM while nothing is waiting', () => {
    renderWithClock(createTestClock(), { active: false, label: 'Loading chat' });

    expect(screen.getByRole('status')).toBe(slot());
    expect(slot()).toBeEmptyDOMElement();
    expect(slot().dataset['state']).toBe('idle');
  });

  it('should reveal its words 1,000 ms after the wait started, by an animation delay and no timer', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clock = createTestClock(0);
    renderWithClock(clock, { active: true, label: 'Loading chat' });

    expect(slot().dataset['state']).toBe('waiting');
    expect(body()).toHaveClass('wait-reveal');
    expect(body()!.style.getPropertyValue('--wait-reveal-delay')).toBe('1000ms');
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('should measure a region that mounts 999 ms into the wait from the wait, so it shows 1 ms later', () => {
    renderWithClock(createTestClock(999), { active: true, label: 'Loading chat', startedAt: 0 });

    expect(body()!.style.getPropertyValue('--wait-reveal-delay')).toBe('1ms');
  });

  it('should show at once for a region that mounts after the delay', () => {
    renderWithClock(createTestClock(5000), { active: true, label: 'Loading chat', startedAt: 3800 });

    expect(body()!.style.getPropertyValue('--wait-reveal-delay')).toBe('-200ms');
  });

  it('should empty the slot when content arrives at 600 ms, before the indicator ever showed', () => {
    const clock = createTestClock(0);
    const view = renderWithClock(clock, { active: true, label: 'Loading chat' });
    clock.set(600);
    view.rerenderWith({ active: false });

    expect(slot().dataset['state']).toBe('idle');
    expect(slot()).toBeEmptyDOMElement();
  });

  it('should keep the indicator to 1,500 ms when content arrives at 1,100 ms', () => {
    const clock = createTestClock(0);
    const view = renderWithClock(clock, { active: true, label: 'Loading chat' });
    clock.set(1100);
    view.rerenderWith({ active: false });

    expect(slot().dataset['state']).toBe('holding');
    expect(body()).toHaveClass('wait-hold');
    expect(body()!.style.getPropertyValue('--wait-hide-delay')).toBe('400ms');
  });

  it('should keep the same slot element across the hold, so the frame never moves', () => {
    const clock = createTestClock(0);
    const view = renderWithClock(clock, { active: true, label: 'Loading chat' });
    const before = slot();
    clock.set(1100);
    view.rerenderWith({ active: false });

    expect(slot()).toBe(before);
  });

  it('should swap in the slow words and Retry at 10,000 ms', () => {
    const onRetry = vi.fn();
    renderWithClock(createTestClock(0), {
      active: true,
      label: 'Loading chat',
      slowLabel: 'Still loading chat',
      onRetry,
    });

    const slow = document.querySelector<HTMLElement>('[data-slot=wait-indicator-slow]')!;
    expect(slow).toHaveClass('wait-after-slow');
    expect(document.querySelector('[data-slot=wait-indicator-label]')).toHaveClass('wait-until-slow');
    expect(body()!.style.getPropertyValue('--wait-slow-delay')).toBe('10000ms');
    expect(slow).toHaveTextContent('Still loading chat…');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('should always carry words, and a percentage when the fraction is known', () => {
    renderWithClock(createTestClock(), { active: true, label: 'Downloading model', progress: 0.424 });

    expect(slot()).toHaveTextContent('Downloading model…42%');
  });

  it('should be seen but not announced inside a route open', () => {
    renderWithClock(createTestClock(), { active: true, label: 'Loading chat', live: false });

    expect(screen.queryByRole('status')).toBeNull();
    expect(slot()).toHaveTextContent('Loading chat…');
  });

  it('should render on the server with delays from navigation start, and hydrate the same element', async () => {
    const html = renderToString(<WaitIndicator active label='Loading projects' />);
    expect(html).toContain('--wait-reveal-delay:calc(1000ms + var(--wait-offset, 0ms))');
    expect(html).toContain('wait-reveal');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const serverBody = container.querySelector('[data-slot=wait-indicator-body]');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = await act(async () =>
      hydrateRoot(container, <WaitIndicator active label='Loading projects' />, {
        onRecoverableError: (error) => {
          throw error;
        },
      }),
    );

    expect(container.querySelector('[data-slot=wait-indicator-body]')).toBe(serverBody);
    expect((serverBody as HTMLElement).style.getPropertyValue('--wait-reveal-delay')).toBe(
      'calc(1000ms + var(--wait-offset, 0ms))',
    );
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('should restart the animation on a new wait, such as a Retry that moves startedAt', () => {
    const clock = createTestClock(11_000);
    const view = renderWithClock(clock, { active: true, label: 'Loading chat', startedAt: 0 });
    const first = body();
    view.rerenderWith({ startedAt: 11_000 });

    expect(body()).not.toBe(first);
    expect(body()!.style.getPropertyValue('--wait-reveal-delay')).toBe('1000ms');
    expect(body()!.style.getPropertyValue('--wait-slow-delay')).toBe('10000ms');
  });

  it('should hold a late-mounted indicator for its full minimum from when it showed', () => {
    const clock = createTestClock(1200);
    const view = renderWithClock(clock, { active: true, label: 'Loading chat', startedAt: 0 });
    clock.set(1300);
    view.rerenderWith({ active: false });

    expect(body()!.style.getPropertyValue('--wait-hide-delay')).toBe('400ms');
  });

  it('should settle once for a startedAt of NaN instead of rendering forever', () => {
    renderWithClock(createTestClock(), { active: true, label: 'Loading chat', startedAt: Number.NaN });

    expect(slot().dataset['state']).toBe('waiting');
  });

  it('should give an idle pill slot the height of the pill', () => {
    renderWithClock(createTestClock(), { active: false, label: 'Checking model files', variant: 'pill' });

    expect(slot()).toHaveClass('min-h-7');
  });
});
