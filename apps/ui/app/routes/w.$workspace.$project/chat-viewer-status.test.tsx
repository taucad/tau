// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createActor, createMachine } from 'xstate';
import type { KernelIssue } from '@taucad/runtime';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';
import { WaitClockProvider } from '@taucad/ui/hooks/use-wait-clock';
import { openWaitContext } from '#hooks/use-wait-start.js';
import type { OpenWait } from '#hooks/use-wait-start.js';

const cad = vi.hoisted(() => ({
  issues: undefined as readonly KernelIssue[] | undefined,
  phase: undefined as 'buffering' | 'connecting' | 'rendering' | undefined,
  send: vi.fn(),
}));
const projectRef = createActor(createMachine({})).start();
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectRef }) }));
vi.mock('#cloud/zoo-upgrade-banner.js', () => ({ ZooUpgradeBanner: () => null }));
vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ send: cad.send }),
  useCadSelector: (selector: unknown) =>
    selector === selectCadFailureIssues ? cad.issues : selector === selectCadLoadingPhase ? cad.phase : undefined,
}));

const { ChatViewerStatus } = await import('#routes/w.$workspace.$project/chat-viewer-status.js');

const clock = vi.hoisted(() => ({ now: 0 }));
const indicator = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('[data-slot=wait-indicator]') ?? undefined;
const revealDelay = (): string | undefined =>
  document.querySelector<HTMLElement>('[data-slot=wait-indicator-body]')?.style.getPropertyValue('--wait-reveal-delay');
const renderAt = (now: number, open?: OpenWait): { rerender: (next?: number) => void; unmount: () => void } => {
  clock.now = now;
  const tree = (): React.JSX.Element => (
    <WaitClockProvider clock={{ now: () => clock.now }}>
      <openWaitContext.Provider value={open}>
        <ChatViewerStatus />
      </openWaitContext.Provider>
    </WaitClockProvider>
  );
  const view = render(tree());
  return {
    rerender: (next) => {
      if (next !== undefined) {
        clock.now = next;
      }
      view.rerender(tree());
    },
    unmount: view.unmount,
  };
};

/* Every case starts from the same doubles, whatever order the cases run in. */
beforeEach(() => {
  clock.now = 0;
  cad.issues = undefined;
  cad.phase = undefined;
  cad.send.mockClear();
});

afterEach(() => {
  clock.now = 0;
  cad.issues = undefined;
  cad.phase = undefined;
  cad.send.mockClear();
  vi.unstubAllGlobals();
});

/*
 * PL7 staging verification 2026-11-21, row 5: the kernel's runtime worker could not load its code, and the viewer of
 * the shared model said only "Channel closed", with nothing to do. Once the unit has replaced the worker as often as
 * the page allows, only a new page can load that code: the status slot, which every viewer profile shows, offers Reload.
 */
describe('ChatViewerStatus after the runtime’s code did not load', () => {
  it('offers Reload, which reloads the page, and no retry in place', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    cad.issues = [
      {
        message: 'The runtime worker failed to load: Importing a module script failed.',
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
      },
    ];

    render(<ChatViewerStatus />);

    expect(screen.getByRole('region', { name: 'Model viewer unavailable' })).toHaveTextContent('Reload the page');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(cad.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /try again/iu })).toBeNull();
  });

  it('says the build’s one label, not the transport step, while the unit replaces the worker', () => {
    cad.phase = 'connecting';

    render(<ChatViewerStatus />);

    expect(indicator()).toHaveTextContent('Rendering…');
    expect(indicator()).not.toHaveTextContent(/connecting/iu);
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('offers nothing for a failure that is not a code load', () => {
    cad.issues = [{ message: 'Channel closed', code: 'RUNTIME', type: 'runtime', severity: 'error' }];

    render(<ChatViewerStatus />);

    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
});

/*
 * Editor startup: the viewer's build status is the stage's one voice while it renders (Progressive Loading Policy rules
 * 16 to 19). It follows the ladder like every other wait: nothing before 1,000 ms, so a fast render shows nothing; one
 * label for every phase; and the build that renders the open's first model keeps the open's clock, so it takes over
 * the open's pill in place.
 */
describe('ChatViewerStatus build pill', () => {
  it('reveals "Rendering…" only from 1,000 ms into a build that starts after the open, and never says it aloud', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    cad.phase = 'rendering';
    const view = renderAt(5000);

    expect(indicator()).toHaveAttribute('data-state', 'waiting');
    expect(revealDelay()).toBe('1000ms');
    expect(document.querySelectorAll('[role=status], [aria-live]')).toHaveLength(0);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    view.unmount();
  });

  it('shows nothing for a render that ends before the indicator mark', () => {
    cad.phase = 'rendering';
    const view = renderAt(5000);
    cad.phase = undefined;
    view.rerender(5400);

    expect(indicator()).toHaveAttribute('data-state', 'idle');
    expect(indicator()).toBeEmptyDOMElement();
    expect(indicator()).toHaveClass('data-[state=idle]:hidden');
  });

  it('draws nothing before the first build', () => {
    renderAt(5000);
    expect(indicator()).toBeUndefined();
  });

  it('keeps the open’s clock for the build that renders the first model', () => {
    cad.phase = 'buffering';
    renderAt(3000, { startedAt: 1200, isRevealed: false });

    /* 1,800 ms into the open: the pill is already due, so it shows at once where the open's pill stood. */
    expect(revealDelay()).toBe('-800ms');
    expect(indicator()).toHaveTextContent('Rendering…');
  });
});
