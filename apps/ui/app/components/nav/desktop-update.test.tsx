// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';
import { DesktopUpdate, DesktopUpdateControl } from '#components/nav/desktop-update.js';

vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopUpdates: () => undefined }));
afterEach(cleanup);
const ready: DesktopUpdateSnapshot = {
  revision: 2,
  requestId: 0,
  phase: 'ready',
  currentVersion: '1.0.74',
  version: '1.0.75',
  channel: 'staging',
  releasePage: 'https://github.com/taucad/tau/releases/tag/desktop-staging%400.1.0-staging.75',
};
const fixture = (initial: Promise<DesktopUpdateSnapshot> = Promise.resolve(ready)) => {
  let listener: ((snapshot: DesktopUpdateSnapshot) => void) | undefined;
  const unsubscribe = vi.fn();
  const bridge: DesktopUpdateBridge = {
    snapshot: async () => initial,
    subscribe: (handler) => {
      listener = handler;
      return unsubscribe;
    },
    check: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
  };
  return {
    bridge,
    unsubscribe,
    emit: (snapshot: DesktopUpdateSnapshot) => {
      act(() => {
        listener?.(snapshot);
      });
    },
  };
};

describe('desktop update control', () => {
  it('should remain absent in the browser', () => {
    render(<DesktopUpdate />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('should reveal readiness without stealing editor focus and install only on request', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'downloading', revision: 1 }));
    const view = render(
      <SidebarProvider>
        <input aria-label='Model draft' />
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    await screen.findByRole('button', { name: 'Downloading an update' });
    screen.getByRole('textbox', { name: 'Model draft' }).focus();
    source.emit(ready);
    expect(screen.getByRole('textbox', { name: 'Model draft' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(source.bridge.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update ready' }));
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    expect(source.bridge.install).toHaveBeenCalledOnce();
    source.emit({ ...ready, revision: 3, phase: 'saving' });
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    source.emit({ ...ready, revision: 4, phase: 'restart-blocked' });
    expect(screen.getByRole('button', { name: 'Retry restart' })).toBeEnabled();
    view.unmount();
    expect(source.unsubscribe).toHaveBeenCalledOnce();
  });
  it('should preserve a newer event when initial hydration resolves late', async () => {
    const initial = Promise.withResolvers<DesktopUpdateSnapshot>();
    const source = fixture(initial.promise);
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    source.emit(ready);
    await act(async () => {
      initial.resolve({ ...ready, revision: 1, phase: 'checking' });
      await initial.promise;
    });
    expect(screen.getByRole('button', { name: 'Update ready' })).toBeInTheDocument();
  });
  it('should open manual checks and keep ordinary current state quiet', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'current' }));
    render(
      <SidebarProvider defaultOpen={false}>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    await act(async () => {
      await source.bridge.snapshot();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    source.emit({ ...ready, phase: 'current', revision: 3, requestId: 1 });
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => {
      expect(source.bridge.check).toHaveBeenCalledOnce();
    });
  });
  it('should not replay a dismissed manual check when navigation remounts the control', async () => {
    const current: DesktopUpdateSnapshot = { ...ready, phase: 'current', requestId: 0, revision: 10 };
    const source = fixture(Promise.resolve(current));
    const control = (route: string) => (
      <SidebarProvider>
        <input aria-label='Model draft' />
        <DesktopUpdateControl key={route} bridge={source.bridge} />
      </SidebarProvider>
    );
    const view = render(control('projects'));
    await act(async () => {
      await source.bridge.snapshot();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    const checked = { ...current, revision: 11, requestId: 8 };
    vi.spyOn(source.bridge, 'snapshot').mockResolvedValue(checked);
    source.emit(checked);
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close update details' }));
    const draft = screen.getByRole('textbox', { name: 'Model draft' });
    draft.focus();
    view.rerender(control('project'));
    await act(async () => {
      await source.bridge.snapshot();
    });
    source.emit({ ...checked, revision: 12 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    expect(draft).toHaveFocus();
    source.emit({ ...current, revision: 13, requestId: 9 });
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
  });
  it('should hydrate a historical check quietly and ignore its later background results', async () => {
    const current: DesktopUpdateSnapshot = { ...ready, phase: 'current', requestId: 7, revision: 10 };
    const source = fixture(Promise.resolve(current));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    await act(async () => {
      await source.bridge.snapshot();
    });
    source.emit({ ...current, revision: 11, phase: 'checking' });
    source.emit({ ...current, revision: 12 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('should reveal a live manual check during hydration without replaying it afterward', async () => {
    const initial = Promise.withResolvers<DesktopUpdateSnapshot>();
    const source = fixture(initial.promise);
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    const current: DesktopUpdateSnapshot = { ...ready, phase: 'current', requestId: 3, revision: 5 };
    source.emit(current);
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close update details' }));
    await act(async () => {
      initial.resolve({ ...current, requestId: 2, revision: 4 });
      await initial.promise;
    });
    source.emit({ ...current, revision: 6 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    source.emit({ ...current, requestId: 4, revision: 7 });
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toBeInTheDocument();
  });
  it('should offer a download rather than a restart on manual platforms', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'available' }));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Update available' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(source.bridge.download).toHaveBeenCalledOnce();
    expect(source.bridge.install).not.toHaveBeenCalled();
  });
});
