// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSafeModeActions, SafeModeBar } from '#components/layout/safe-mode-bar.js';
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
