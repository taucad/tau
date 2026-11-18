// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';
import { DesktopUpdate, DesktopUpdateControl } from '#components/nav/desktop-update.js';

vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({ desktopUpdates: () => undefined }));
afterEach(cleanup);
const ready: DesktopUpdateSnapshot = {
  revision: 2,
  requestId: 0,
  phase: 'ready',
  currentVersion: '1.0.74',
  version: '1.0.75',
  channel: 'staging',
  releasePage: 'https://github.com/taucad/tau/releases/tag/desktop-staging%400.1.0-staging.75',
  downloadPage: 'https://github.com/taucad/tau/releases/tag/desktop-staging%400.1.0-staging.75',
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
  it('describes explicit installation without promising install on quit', async () => {
    const source = fixture(Promise.resolve({ ...ready, installOnQuit: false }));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Update ready' }));
    expect(await screen.findByText(/Quitting normally leaves the update for later/u)).toBeInTheDocument();
    expect(screen.queryByText(/installs when you quit Tau/u)).not.toBeInTheDocument();
  });
  it('asks to move Tau to Applications and moves it on request', async () => {
    const source = fixture(
      Promise.resolve({
        ...ready,
        phase: 'move-required',
        detail: 'Tau is running from a read-only location. Move Tau to Applications to receive updates.',
      }),
    );
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Move Tau to update' }));
    // The renderer words the notice; main's own detail for this phase is ignored.
    expect(await screen.findByText(/Moving it to Applications restarts Tau/u)).toBeInTheDocument();
    expect(screen.queryByText(/read-only location/u)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Applications' }));
    await waitFor(() => {
      expect(source.bridge.download).toHaveBeenCalledOnce();
    });
    expect(source.bridge.install).not.toHaveBeenCalled();
  });
  it('reveals APT policy without offering an installer action', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'system-managed' }));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    await act(async () => undefined);
    source.emit({ ...ready, phase: 'system-managed', revision: 3, requestId: 1 });
    expect(await screen.findByText(/Tau updates through APT on this computer/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart now' })).not.toBeInTheDocument();
  });
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
    await screen.findByRole('button', { name: 'Downloading update' });
    screen.getByRole('textbox', { name: 'Model draft' }).focus();
    source.emit(ready);
    expect(screen.getByRole('textbox', { name: 'Model draft' })).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
    expect(source.bridge.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update ready' }));
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    expect(source.bridge.install).toHaveBeenCalledOnce();
    source.emit({ ...ready, revision: 3, phase: 'saving' });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    source.emit({ ...ready, revision: 4, phase: 'restart-blocked' });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
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
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
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
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    const checked = { ...current, revision: 11, requestId: 8 };
    vi.spyOn(source.bridge, 'snapshot').mockResolvedValue(checked);
    source.emit(checked);
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'You’re up to date' }));
    const draft = screen.getByRole('textbox', { name: 'Model draft' });
    draft.focus();
    view.rerender(control('project'));
    await act(async () => {
      await source.bridge.snapshot();
    });
    source.emit({ ...checked, revision: 12 });
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    expect(draft).toHaveFocus();
    source.emit({ ...current, revision: 13, requestId: 9 });
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
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
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
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
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'You’re up to date' }));
    await act(async () => {
      initial.resolve({ ...current, requestId: 2, revision: 4 });
      await initial.promise;
    });
    source.emit({ ...current, revision: 6 });
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'You’re up to date' })).not.toBeInTheDocument();
    source.emit({ ...current, requestId: 4, revision: 7 });
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
  });
  it('should take one request while downloading and then only say that Tau restarts when it finishes', async () => {
    const downloading: DesktopUpdateSnapshot = { ...ready, phase: 'downloading', revision: 1 };
    const source = fixture(Promise.resolve(downloading));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Downloading update' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restart when ready' }));
    await waitFor(() => {
      expect(source.bridge.install).toHaveBeenCalledOnce();
    });
    expect(source.bridge.check).not.toHaveBeenCalled();
    source.emit({ ...downloading, revision: 2, installWhenReady: true, detail: 'Downloading Tau 1.0.75…' });
    expect(await screen.findByText(/restart as soon as the download finishes/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restarts when ready' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart when ready' })).not.toBeInTheDocument();
  });
  it('should retry a failed update as a check, never as consent to restart', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'error', revision: 1 }));
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Couldn’t update' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(source.bridge.check).toHaveBeenCalledOnce();
    });
    expect(source.bridge.install).not.toHaveBeenCalled();
  });
  it('should name a failed action and offer "Try again" for it', async () => {
    const source = fixture(Promise.resolve({ ...ready, phase: 'available', revision: 1 }));
    source.bridge.download = vi.fn(async () => {
      throw new Error('offline');
    });
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Update available' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('button', { name: 'Couldn’t download' })).toBeInTheDocument();
    expect(screen.getByText('Your work isn’t affected. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
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
  it('should name the clock and offer to check again and Download Tau when the clock refused an update (T-B25.1)', async () => {
    const source = fixture(
      Promise.resolve({
        ...ready,
        phase: 'error',
        blockedReason: 'clock',
        version: undefined,
        releasePage: undefined,
        downloadPage: 'https://github.com/taucad/tau/releases',
      }),
    );
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Check your date and time' }));
    expect(await screen.findByText(/computer’s date and time/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Tau/u })).toHaveAttribute(
      'href',
      'https://github.com/taucad/tau/releases',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => {
      expect(source.bridge.check).toHaveBeenCalledOnce();
    });
    expect(source.bridge.install).not.toHaveBeenCalled();
  });
  it('should say this copy cannot update itself and offer only Download Tau when its installation is damaged (T-B27.1)', async () => {
    const source = fixture(
      Promise.resolve({
        ...ready,
        phase: 'disabled',
        blockedReason: 'installation-marker',
        version: undefined,
        releasePage: undefined,
        downloadPage: 'https://github.com/taucad/tau/releases/latest',
        detail: undefined,
      }),
    );
    render(
      <SidebarProvider>
        <DesktopUpdateControl bridge={source.bridge} />
      </SidebarProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'This copy of Tau can’t update itself' }));
    expect(await screen.findByText(/Download Tau and install it again/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Tau/u })).toHaveAttribute(
      'href',
      'https://github.com/taucad/tau/releases/latest',
    );
    expect(screen.queryByRole('button', { name: /Retry|Check again|Restart/u })).not.toBeInTheDocument();
  });
});
