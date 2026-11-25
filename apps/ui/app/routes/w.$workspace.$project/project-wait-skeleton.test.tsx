/*
 * A pane's body while the project opens (Progressive Loading Policy rules 15, 16, 17, 21 and 22; cloud open loading
 * states, Part 5): the pane keeps its frame and draws its content's shape from the ladder's 300 ms mark, with no words,
 * spinner or action. The viewer alone says the open, and fails it once; a phone sheet at full that covers the viewer
 * says the failure in its body instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaitClockProvider } from '@taucad/ui/hooks/use-wait-clock';
import { ProjectWaitSkeleton } from '#routes/w.$workspace.$project/project-wait-skeleton.js';
import type { ProjectWaitShape } from '#routes/w.$workspace.$project/project-wait-skeleton.js';
import {
  CoveringSheetFailure,
  CoveringSheetProvider,
  CoveringSheetStatus,
} from '#routes/w.$workspace.$project/covering-sheet.js';
import type { ModelAvailability } from '#hooks/use-project-availability.js';
import type { LargeObjectsFacet } from '@taucad/revisions';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  syncNow: vi.fn(),
  connectRemote: vi.fn(),
  status: undefined as unknown,
  now: 0,
  /* The viewer's own wait, which a covering sheet speaks for. */
  model: 'ready' as ModelAvailability,
  facet: undefined as LargeObjectsFacet | undefined,
  isCheckSlow: false,
  /* The session's open: `pending` while the open itself waits for the model's files. */
  session: 'settled',
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/w/x/p', search: '' }),
  Link: ({ to, children }: { readonly to: string; readonly children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('#hooks/use-project-availability.js', () => ({
  useLargeObjects: () => mocks.facet,
  useProjectAvailability: () => 'ready',
  useModelAvailability: () => mocks.model,
  useFileCheckSlow: () => mocks.isCheckSlow,
  useCloudOpenPending: () => false,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: () => ({
    getSnapshot: () => ({ context: { status: { p: { availability: mocks.session } } } }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => ({ send: mocks.send }),
  useRevisionCommands: () => ({ connectRemote: mocks.connectRemote, syncNow: mocks.syncNow }),
  useRevisionStatus: () => mocks.status,
}));

const clock = { now: (): number => mocks.now };

function renderWait(
  state: Exclude<ModelAvailability, 'ready'>,
  options: { shape?: ProjectWaitShape; isCovering?: boolean } = {},
): ReturnType<typeof render> {
  const element = (next: Exclude<ModelAvailability, 'ready'>): React.JSX.Element => (
    <WaitClockProvider clock={clock}>
      <CoveringSheetProvider isCovering={options.isCovering ?? false}>
        {/* As the phone host draws it: the sheet's body, and the viewer's failure over it. */}
        <ProjectWaitSkeleton state={next} shape={options.shape ?? 'fields'} label='Parameters' />
        <CoveringSheetFailure />
      </CoveringSheetProvider>
    </WaitClockProvider>
  );
  mocks.model = state;
  const view = render(element(state));
  return {
    ...view,
    rerender: (next: unknown) => {
      mocks.model = next as ModelAvailability;
      view.rerender(element(next as Exclude<ModelAvailability, 'ready'>));
    },
  };
}

const bars = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('[data-slot=project-wait-skeleton]') ?? undefined;
/** Every live region and alert in the document: the route's announcement is the open's only one (rule 22). */
const liveRegions = (): Element[] => [
  ...document.querySelectorAll('[role=status], [role=alert], [role=log], [aria-live]:not([aria-live=off])'),
];

describe('ProjectWaitSkeleton', () => {
  it.each(['transcript', 'fields', 'tree', 'list', 'code'] as const)(
    'should draw the %s shape as aria-hidden bars from 300 ms on the wait clock, with no words, spinner or action',
    (shape) => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      mocks.now = 0;
      renderWait('downloading', { shape });

      const pane = screen.getByRole('group', { name: 'Parameters' });
      expect(pane).toHaveAttribute('aria-busy', 'true');
      expect(bars()).toHaveClass('wait-skeleton');
      expect(bars()).toHaveAttribute('aria-hidden', 'true');
      expect(bars()!.style.getPropertyValue('--wait-skeleton-delay')).toBe('300ms');
      expect(bars()!.querySelectorAll('[data-slot=skeleton]').length).toBeGreaterThan(0);
      expect(pane.textContent).toBe('');
      expect(pane.querySelector('[data-slot=wait-indicator], [data-slot=loader], svg')).toBeNull();
      expect(within(pane).queryByRole('button')).toBeNull();
      expect(liveRegions()).toEqual([]);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    },
  );

  it('should keep its frame and its bars as the same elements through every step of the open', () => {
    mocks.now = 0;
    const view = renderWait('connecting');
    const pane = screen.getByRole('group', { name: 'Parameters' });
    const shape = bars();

    for (const step of ['downloading', 'preparing', 'filesChecking', 'files'] as const) {
      mocks.now += 1500;
      view.rerender(step);
      expect(screen.getByRole('group', { name: 'Parameters' }), step).toBe(pane);
      expect(bars(), step).toBe(shape);
      /* One wait, one clock: the bars keep the delay they started with. */
      expect(bars()!.style.getPropertyValue('--wait-skeleton-delay'), step).toBe('300ms');
    }
  });

  it.each(['offline', 'failed', 'account', 'filesFailed'] as const)(
    'should stop its bars and say nothing when the wait ends %s: the viewer says it, once',
    (state) => {
      const view = renderWait('downloading');
      const pane = screen.getByRole('group', { name: 'Parameters' });
      view.rerender(state);

      expect(screen.getByRole('group', { name: 'Parameters' })).toBe(pane);
      expect(pane).toHaveAttribute('aria-busy', 'false');
      expect(bars()).toBeUndefined();
      expect(pane.textContent).toBe('');
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
      expect(liveRegions()).toEqual([]);
    },
  );
});

describe('a sheet that covers the viewer', () => {
  /* The chats can be open (the sheet shows the transcript) while the viewer's wait fails: the notice still shows. */
  it('should say the viewer’s failure over a surface that has no wait of its own, such as an open chat', async () => {
    mocks.send.mockClear();
    mocks.model = 'filesFailed';
    render(
      <CoveringSheetProvider isCovering>
        <div data-testid='chat-transcript' />
        <CoveringSheetFailure />
      </CoveringSheetProvider>,
    );

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Couldn’t download model files');
    await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
  });

  it('should say nothing where the sheet does not cover the viewer, which says the failure itself', () => {
    mocks.model = 'failed';
    render(
      <CoveringSheetProvider isCovering={false}>
        <CoveringSheetFailure />
      </CoveringSheetProvider>,
    );
    expect(document.querySelector('[data-slot=covering-sheet-notice]')).toBeNull();
  });

  it('should draw one notice when a waiting pane is the sheet’s body', () => {
    mocks.status = undefined;
    renderWait('failed', { isCovering: true });
    expect(document.querySelectorAll('[data-slot=covering-sheet-notice]')).toHaveLength(1);
  });

  const status = (
    remote: Readonly<Record<string, unknown>>,
    sync: Readonly<Record<string, unknown>> = {},
  ): unknown => ({
    remote: { phase: 'failed', reason: undefined, error: undefined, ...remote },
    sync: { state: 'idle', reason: undefined, error: undefined, ...sync },
  });

  it('should say a failed open in its body, once, as a labelled group with "Try again"', async () => {
    mocks.status = status({ reason: 'unknown', error: 'The download stopped.' });
    renderWait('failed', { isCovering: true });

    const notice = screen.getByRole('group', { name: 'Couldn’t open this project' });
    expect(notice).toHaveTextContent('The download didn’t finish. Try again.');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(liveRegions()).toEqual([]);
    await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    expect(mocks.connectRemote).toHaveBeenCalledOnce();
  });

  /* A refused connect-time push is not a download that did not finish. */
  it('should say a refused open could not be backed up, and offer History instead of "Try again"', () => {
    mocks.status = status({ reason: 'rejected', error: 'The remote refused refs/heads/main.' });
    renderWait('failed', { isCovering: true });

    const notice = screen.getByRole('group', { name: 'Couldn’t back up this project' });
    expect(within(notice).getByRole('link', { name: 'Open History' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('should name the device only offline, where it is the reason going online helps', () => {
    mocks.status = status({}, { online: false });
    renderWait('offline', { isCovering: true });

    expect(screen.getByRole('group', { name: 'You’re offline' })).toHaveTextContent(
      'This project isn’t on this device yet. Go online, then try again.',
    );
  });

  it('should draw its bars, and no notice, while the open still runs', () => {
    renderWait('downloading', { isCovering: true });

    expect(bars()).toBeDefined();
    expect(document.querySelector('[data-slot=covering-sheet-notice]')).toBeNull();
  });

  it('should say a failed download of the model’s files with its own retry, which no route announcement says', async () => {
    mocks.send.mockClear();
    renderWait('filesFailed', { isCovering: true });

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Couldn’t download model files');
    await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
  });
});

describe('the covering sheet header’s status', () => {
  const renderStatus = (model: ModelAvailability): void => {
    mocks.model = model;
    render(
      <WaitClockProvider clock={clock}>
        <CoveringSheetProvider isCovering>
          <CoveringSheetStatus />
        </CoveringSheetProvider>
      </WaitClockProvider>,
    );
  };
  const indicator = (): HTMLElement => document.querySelector<HTMLElement>('[data-slot=wait-indicator]')!;

  it('should offer the slow file check’s retry beside the header indicator, since the viewer behind is inert', async () => {
    mocks.send.mockClear();
    mocks.isCheckSlow = true;
    try {
      renderStatus('filesChecking');
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
    } finally {
      mocks.isCheckSlow = false;
    }
  });

  it('should show no percentage, which the stage may already have dropped for a transfer that began again', () => {
    mocks.facet = {
      phase: 'fetching',
      paths: ['a.step'],
      objects: 1,
      totalObjects: 4,
      bytes: 1024,
      totalBytes: 4096,
    };
    try {
      renderStatus('files');
      expect(indicator()).toHaveTextContent('Downloading model files…');
      expect(indicator()).not.toHaveTextContent('%');
    } finally {
      mocks.facet = undefined;
    }
  });

  /* The route's announcement is quiet once the project is open: a wait for the model's files that starts after the open
   * is its own group and says itself; one the open waits for stays seen, not announced (rule 22). */
  it('should announce a wait for the model’s files that starts after the open, and not one the open waits for', () => {
    mocks.session = 'settled';
    const view = render(<span />);
    renderStatus('filesChecking');
    expect(indicator()).toHaveAttribute('role', 'status');
    view.unmount();
    document.body.innerHTML = '';

    mocks.session = 'pending';
    try {
      renderStatus('filesChecking');
      expect(indicator()).not.toHaveAttribute('role');
    } finally {
      mocks.session = 'settled';
    }
  });
});
