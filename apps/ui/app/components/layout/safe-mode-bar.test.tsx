// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSafeModeActions, SafeModeBar, SafeModeNotice } from '#components/layout/safe-mode-bar.js';
import { desktopSafeMode } from '#lib/desktop-safe-mode.js';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'tau');
});

/** T-R12.10 (R12): the desktop bar says why safe mode started and opens the recovery panel. */
describe('SafeModeBar on desktop (T-R12.10)', () => {
  it('should name the reason and open the recovery panel', async () => {
    const open = vi.fn(async () => undefined);
    const restartNormally = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      tau: { safeMode: { reason: 'unhealthy-launches' }, troubleshooting: { open, restartNormally } },
    });
    render(
      <SafeModeBar reason={desktopSafeMode()!.reason}>
        <DesktopSafeModeActions />
      </SafeModeBar>,
    );
    expect(screen.getByRole('status', { name: 'Safe mode' })).toHaveTextContent(
      'Tau did not start properly last time, so it started in safe mode.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open Recovery…' }));
    expect(open).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Restart normally' }));
    expect(restartNormally).toHaveBeenCalledOnce();
  });

  it('should read safe mode from the desktop bridge only when it carries a known reason', () => {
    expect(desktopSafeMode()).toBeUndefined();
    Object.assign(globalThis, { tau: { safeMode: { reason: 'requested' } } });
    expect(desktopSafeMode()).toEqual({ reason: 'requested' });
    Object.assign(globalThis, { tau: { safeMode: { reason: 'because' } } });
    expect(desktopSafeMode()).toBeUndefined();
  });

  it('should hide an action whose bridge member is missing', () => {
    Object.assign(globalThis, { tau: { safeMode: { reason: 'requested' }, troubleshooting: {} } });
    render(
      <SafeModeBar reason='requested'>
        <DesktopSafeModeActions />
      </SafeModeBar>,
    );
    expect(screen.queryByRole('button', { name: 'Open Recovery…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart normally' })).toBeNull();
  });
});

/** R12 web: `?safe=1` is read in the browser only, so the server document never carries the bar. */
describe('SafeModeNotice hydration', () => {
  it('should hydrate a safe-mode load without a mismatch and show the bar right after', async () => {
    const container = document.createElement('div');
    /* The server's runtime has no `?safe=1`; the browser's has. */
    container.innerHTML = renderToString(<SafeModeNotice isRequested={false} />);
    expect(container.querySelector('[data-slot="safe-mode-bar"]')).toBeNull();
    document.body.append(container);
    const recoverableError = vi.fn();
    const root = hydrateRoot(container, <SafeModeNotice isRequested />, { onRecoverableError: recoverableError });
    await act(async () => {
      await Promise.resolve();
    });
    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="safe-mode-bar"]')).toHaveTextContent('You started Tau in safe mode.');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('should show the desktop reason and its actions once hydrated', async () => {
    Object.assign(globalThis, {
      tau: { safeMode: { reason: 'unhealthy-launches' }, troubleshooting: { open: vi.fn() } },
    });
    render(<SafeModeNotice isRequested={false} />);
    expect(await screen.findByRole('button', { name: 'Open Recovery…' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Safe mode' })).toHaveTextContent('Tau did not start properly last time');
  });
});
