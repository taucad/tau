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
  const { BrowserUpdate } = await import('#components/nav/browser-update.js');
  const { BuildSkewBanner } = await import('#components/build-skew-banner.js');
  // Same module instance as the control, so they share one sidebar context.
  const { SidebarProvider } = await import('@taucad/ui/components/sidebar');
  return { ...skew, BrowserUpdate, BuildSkewBanner, SidebarProvider };
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
    const { BrowserUpdate, SidebarProvider } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
      </SidebarProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reveals the sidebar prompt without taking editor focus and reloads only on request', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    const { BrowserUpdate, BuildSkewBanner, SidebarProvider, buildId } = await load();
    render(
      <SidebarProvider defaultOpen={false}>
        <input aria-label='Model draft' />
        <BrowserUpdate />
        <BuildSkewBanner />
      </SidebarProvider>,
    );
    screen.getByRole('textbox', { name: 'Model draft' }).focus();

    await announce(buildId + 1);

    expect(screen.getByRole('button', { name: 'Update ready' })).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toHaveTextContent(
      'Reload to continue with the latest version.',
    );
    expect(screen.getByRole('textbox', { name: 'Model draft' })).toHaveFocus();
    // The sidebar owns the prompt, so the floating fallback stays away.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload now' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('falls back to the floating prompt while the sidebar is collapsed', async () => {
    const { BrowserUpdate, BuildSkewBanner, SidebarProvider, buildId } = await load();
    const { useSidebar } = await import('@taucad/ui/components/sidebar');
    function Collapse(): React.JSX.Element {
      const { setOpen } = useSidebar();
      return (
        <button
          type='button'
          onClick={() => {
            setOpen(false);
          }}
        >
          Collapse
        </button>
      );
    }
    render(
      <SidebarProvider>
        <Collapse />
        <BrowserUpdate />
        <BuildSkewBanner />
      </SidebarProvider>,
    );
    await announce(buildId + 1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is available');
  });

  it('shows the newest build when a later one is announced', async () => {
    const { BrowserUpdate, SidebarProvider, buildId } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
      </SidebarProvider>,
    );
    const later = buildId + 48 * 3_600_000;
    const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    await announce(buildId + 3_600_000);
    await announce(later);

    expect(await screen.findByRole('dialog', { name: 'Tau update' })).toHaveTextContent(
      `Tau · Updated ${format.format(later)}`,
    );
  });

  it('words a rollback as a replacement and dates the build it serves', async () => {
    const { BrowserUpdate, SidebarProvider, buildId, markBuildSuperseded } = await load();
    render(
      <SidebarProvider>
        <BrowserUpdate />
      </SidebarProvider>,
    );
    const rolledBack = buildId - 48 * 3_600_000;
    const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    act(() => {
      markBuildSuperseded(rolledBack, 'server');
    });

    const dialog = await screen.findByRole('dialog', { name: 'Tau update' });
    expect(dialog).toHaveTextContent(`Tau · Built ${format.format(rolledBack)}`);
    expect(dialog).toHaveTextContent('This version of Tau has been replaced.');
    expect(dialog).not.toHaveTextContent('newer version');
  });

  it('falls back to the floating prompt where no sidebar is mounted', async () => {
    const { BuildSkewBanner, buildId } = await load();
    render(<BuildSkewBanner />);

    await announce(buildId + 1);

    expect(screen.getByRole('alert')).toHaveTextContent('A newer version of Tau is available');
  });
});
