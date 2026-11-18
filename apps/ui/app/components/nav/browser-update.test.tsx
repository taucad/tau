// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaConfig } from '#constants/meta.constants.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

const loaded: Array<{ readonly closeBuildSkewChannel: () => void }> = [];

/** Fresh module graph per test: the skew guard captures its state at module load. */
const load = async () => {
  vi.resetModules();
  const skew = await import('#filesystem/build-skew.js');
  loaded.push(skew);
  const { BrowserUpdate, BrowserUpdateReveal } = await import('#components/nav/browser-update.js');
  // Same module instance as the control, so they share one sidebar context.
  const { SidebarProvider, useSidebar } = await import('@taucad/ui/components/sidebar');
  return { ...skew, BrowserUpdate, BrowserUpdateReveal, SidebarProvider, useSidebar };
};

const announce = async (buildId: number): Promise<void> => {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(buildId);
  channel.close();
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
};

beforeEach(() => {
  // Announcements ask the server first; unreachable, the newer announcement wins.
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
});

afterEach(() => {
  cleanup();
  // An earlier test's module would otherwise keep answering this test's announcements.
  for (const skew of loaded.splice(0)) {
    skew.closeBuildSkewChannel();
  }
  vi.unstubAllGlobals();
});

describe('browser update control', () => {
  it('stays absent until a newer build is open in another tab', async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reveals the sidebar prompt without taking editor focus and reloads only on request', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, buildId } = await load();
    render(
      <SidebarProvider defaultOpen={false}>
        <input aria-label='Model draft' />
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    screen.getByRole('textbox', { name: 'Model draft' }).focus();

    await announce(buildId + 1);

    // Another tab's newer version stopped this tab's saving, and the title says so.
    expect(screen.getByRole('button', { name: 'Reload needed' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Tau update' })).toHaveTextContent(
      'A newer Tau is open in another tab, so this tab has stopped saving changes to your project list.',
    );
    expect(screen.getByRole('textbox', { name: 'Model draft' })).toHaveFocus();
    // The sidebar is the only update surface: nothing floats over the workspace.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload now' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows the newest build when a later one is announced', async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, buildId } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    const later = buildId + 48 * 3_600_000;
    const format = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    await announce(buildId + 3_600_000);
    await announce(later);

    expect(await screen.findByRole('group', { name: 'Tau update' })).toHaveTextContent(
      `Tau · Updated ${format.format(later)}`,
    );
  });

  it('words a rollback as a withdrawn version and dates the version it switches to', async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, buildId } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    const rolledBack = buildId - 48 * 3_600_000;
    const format = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // A newer tab announces itself, and the server names the older build it rolled back to.
    vi.stubGlobal('fetch', async () => Response.json({ buildId: rolledBack }));
    await announce(buildId + 1);

    const details = await screen.findByRole('group', { name: 'Tau update' });
    expect(details).toHaveTextContent(`Tau · Version from ${format.format(rolledBack)}`);
    expect(details).toHaveTextContent('This version of Tau was withdrawn, and this tab has stopped saving');
    expect(details).not.toHaveTextContent('newer');
  });

  it("shows a lone tab's deploy offer without opening the sidebar while the tab still writes", async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, useSidebar, buildId, offerReload, isBuildSuperseded } =
      await load();
    const SidebarState = (): React.JSX.Element => {
      const { open } = useSidebar();
      return <output aria-label='Sidebar' data-open={String(open)} />;
    };
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarState />
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );

    act(() => {
      offerReload(buildId + 1);
    });

    expect(isBuildSuperseded()).toBe(false);
    expect(screen.getByRole('button', { name: 'Update ready' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Sidebar' })).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('group', { name: 'Tau update' })).not.toBeInTheDocument();
  });

  it('opens the sidebar once writes stop, even after the offer was already shown', async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, useSidebar, buildId, offerReload } = await load();
    const SidebarState = (): React.JSX.Element => {
      const { open } = useSidebar();
      return <output aria-label='Sidebar' data-open={String(open)} />;
    };
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarState />
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    act(() => {
      offerReload(buildId + 1);
    });

    await announce(buildId + 2);

    expect(screen.getByRole('status', { name: 'Sidebar' })).toHaveAttribute('data-open', 'true');
    expect(await screen.findByRole('group', { name: 'Tau update' })).toBeInTheDocument();
  });

  it('does not open the sidebar again when the offer is withdrawn', async () => {
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, useSidebar, buildId } = await load();
    const SidebarState = (): React.JSX.Element => {
      const { open, setOpen } = useSidebar();
      return (
        <button
          type='button'
          aria-label='Collapse sidebar'
          data-open={String(open)}
          onClick={() => {
            setOpen(false);
          }}
        />
      );
    };
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarState />
        <BrowserUpdate />
        <BrowserUpdateReveal />
      </SidebarProvider>,
    );
    await announce(buildId + 1);
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse).toHaveAttribute('data-open', 'true');
    fireEvent.click(collapse);
    expect(collapse).toHaveAttribute('data-open', 'false');

    // The server names this build live again, which withdraws the offer.
    vi.stubGlobal('fetch', async () => Response.json({ buildId }));
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ buildId: buildId + 1, live: true });
    channel.close();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
    });

    expect(collapse).toHaveAttribute('data-open', 'false');
  });

  it('opens the closed mobile sheet once writes stop, while the control inside it is unmounted', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { BrowserUpdate, BrowserUpdateReveal, SidebarProvider, useSidebar, buildId } = await load();
    // The mobile sheet mounts its content, and the control with it, only while open.
    const MobileSheet = (): React.JSX.Element => {
      const { openMobile } = useSidebar();
      return (
        <>
          <output aria-label='Mobile sheet' data-open={String(openMobile)} />
          {openMobile ? <BrowserUpdate /> : null}
        </>
      );
    };
    render(
      <SidebarProvider>
        <BrowserUpdateReveal />
        <MobileSheet />
      </SidebarProvider>,
    );
    expect(screen.getByRole('status', { name: 'Mobile sheet' })).toHaveAttribute('data-open', 'false');

    await announce(buildId + 1);

    expect(screen.getByRole('status', { name: 'Mobile sheet' })).toHaveAttribute('data-open', 'true');
    expect(await screen.findByRole('group', { name: 'Tau update' })).toHaveTextContent(
      'this tab has stopped saving changes to your project list',
    );
  });

  it('words each state by whether saving stopped and whether the reload goes back', async () => {
    const { updateCopy } = await import('#components/nav/browser-update.js');
    expect(updateCopy({ hasStoppedSaving: false, isRolledBack: false })).toEqual({
      title: 'Update ready',
      detail: 'Reload when you’re ready to get the latest version. Until then, some parts of Tau may not load.',
    });
    expect(updateCopy({ hasStoppedSaving: false, isRolledBack: true }).title).toBe('Version withdrawn');
    expect(updateCopy({ hasStoppedSaving: true, isRolledBack: false }).title).toBe('Reload needed');
    expect(updateCopy({ hasStoppedSaving: true, isRolledBack: true }).detail).toMatch(/withdrawn.*stopped saving/u);
  });
});
