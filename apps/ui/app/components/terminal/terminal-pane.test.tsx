import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { DesktopTerminalBridge, DesktopTerminalSession, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
import { closePanel, TerminalCloseContext, useDockviewTerminalCloseHost } from '#components/terminal/terminal-close.js';
import type { TerminalRendererLoader } from '#components/terminal/terminal-pane.js';
import type { TerminalAvailability } from '#components/terminal/terminal-availability.js';
import type { TerminalRendererOptions, TerminalRendererView } from '#components/terminal/terminal-renderer.js';

type FakeSession = DesktopTerminalSession & { readonly calls: Record<keyof DesktopTerminalSession, unknown[][]> };

const createSession = (): FakeSession => {
  const calls: Record<keyof DesktopTerminalSession, unknown[][]> = {
    input: [],
    resize: [],
    ack: [],
    requestAccess: [],
    decideAccess: [],
    close: [],
  };
  const record =
    (name: keyof DesktopTerminalSession) =>
    (...arguments_: unknown[]): void => {
      calls[name].push(arguments_);
    };
  return {
    calls,
    input: record('input'),
    resize: record('resize'),
    ack: record('ack'),
    requestAccess: record('requestAccess'),
    decideAccess: record('decideAccess'),
    close: record('close'),
  };
};

type Harness = {
  bridge: DesktopTerminalBridge;
  open: ReturnType<typeof vi.fn>;
  session: FakeSession;
  emit: (frame: TerminalHostFrame) => void;
  view: TerminalRendererView & {
    writes: Array<{ data: string; painted: () => void }>;
    type: (data: string) => void;
  };
  options: () => TerminalRendererOptions;
  loadRenderer: TerminalRendererLoader;
};

const createHarness = (): Harness => {
  const session = createSession();
  let listener: ((frame: TerminalHostFrame) => void) | undefined;
  const open = vi.fn((_request: unknown, frameListener: (frame: TerminalHostFrame) => void) => {
    listener = frameListener;
    return session;
  });
  const writes: Array<{ data: string; painted: () => void }> = [];
  let dataListener: ((data: string) => void) | undefined;
  const view = {
    writes,
    type(data: string) {
      dataListener?.(data);
    },
    renderer: (): 'webgl' => 'webgl',
    write(data: string, painted: () => void) {
      writes.push({ data, painted });
    },
    onData(next: (data: string) => void) {
      dataListener = next;
      return () => {
        dataListener = undefined;
      };
    },
    fit: () => ({ columns: 120, rows: 30 }),
    focus: vi.fn(),
    setScreenReaderMode: vi.fn(),
    search: vi.fn(() => true),
    clearFind: vi.fn(),
    dispose: vi.fn(),
  };
  let captured: TerminalRendererOptions | undefined;
  return {
    bridge: { open } as unknown as DesktopTerminalBridge,
    open,
    session,
    emit(frame) {
      act(() => {
        listener?.(frame);
      });
    },
    view,
    options: () => captured!,
    loadRenderer: async (options) => {
      captured = options;
      return view;
    },
  };
};

const available = (harness: Harness, projectRoot = '/home/me/Tau/project-1'): TerminalAvailability => ({
  status: 'available',
  projectRoot,
  bridge: harness.bridge,
});

const opened: TerminalHostFrame = {
  type: 'opened',
  session: { id: 'session-1', projectLabel: 'project-1', access: { read: [], write: [], domains: [] } },
};

let harness: Harness;
beforeEach(() => {
  harness = createHarness();
});

const startTerminal = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Start Terminal' }));
  harness.emit(opened);
};

describe('TerminalPane', () => {
  it('shows Start Terminal and opens nothing until a person presses it (D21)', async () => {
    const { rerender, unmount } = render(
      <TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />,
    );
    expect(screen.getByRole('button', { name: 'Start Terminal' })).toBeEnabled();
    rerender(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    unmount();
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    expect(harness.open).not.toHaveBeenCalled();

    await startTerminal();
    expect(harness.open).toHaveBeenCalledExactlyOnceWith(
      { projectRoot: '/home/me/Tau/project-1', size: { columns: 120, rows: 30 } },
      expect.any(Function),
    );
    expect(harness.options().fontFamily).toContain('Geist Mono');
    expect(harness.view.focus).toHaveBeenCalled();
  });

  it('cannot start while the folder is still being looked up', () => {
    render(<TerminalPane availability={{ status: 'checking' }} loadRenderer={harness.loadRenderer} />);
    expect(screen.getByRole('button', { name: 'Start Terminal' })).toBeDisabled();
  });

  it('shows the reason and what to do when the Terminal is unavailable', () => {
    render(
      <TerminalPane
        availability={{ status: 'unavailable', message: 'No folder here.', recovery: 'Open a folder project.' }}
        loadRenderer={harness.loadRenderer}
      />,
    );
    expect(screen.getByText('No folder here.')).toBeInTheDocument();
    expect(screen.getByText('Open a folder project.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Terminal' })).toBeNull();
  });

  it('paints output as data and acknowledges each frame only after it is painted', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit({ type: 'output', data: 'hello\r\n', offset: 7 });
    expect(harness.view.writes.map(({ data }) => data)).toEqual(['hello\r\n']);
    expect(harness.session.calls.ack).toEqual([]);
    harness.view.writes[0]!.painted();
    expect(harness.session.calls.ack).toEqual([[7]]);
  });

  it('sends typed input and splits a paste larger than one input frame', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.view.type('ls\r');
    harness.view.type('x'.repeat(70_000));
    expect(harness.session.calls.input.map(([data]) => (data as string).length)).toEqual([3, 65_536, 4464]);
  });

  it('approves extra access only in pane chrome, bound to the host-minted request id (D21, I9)', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();

    await userEvent.click(screen.getByRole('button', { name: 'Request access' }));
    const form = screen.getByRole('form', { name: 'Request Terminal access' });
    await userEvent.type(within(form).getByLabelText('Hosts to reach'), 'registry.npmjs.org');
    await userEvent.click(within(form).getByRole('button', { name: 'Request access' }));
    expect(harness.session.calls.requestAccess).toEqual([[{ read: [], write: [], domains: ['registry.npmjs.org'] }]]);
    expect(screen.queryByText('Allow this Terminal more access?')).toBeNull();

    harness.emit({
      type: 'access-requested',
      requestId: 'host-minted-1',
      access: { read: [], write: [], domains: ['registry.npmjs.org'] },
      expiresAt: '2026-10-25T16:00:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Allow and restart' }));
    expect(harness.session.calls.decideAccess).toEqual([['host-minted-1', 'allow']]);
  });

  it('never turns hostile output into a decision, a card or a link (I9, A15)', async () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit({
      type: 'output',
      data: '\u001B]52;c;aGk=\u0007\u001B]8;;javascript:alert(1)\u001B\\Allow and restart\u001B]8;;\u001B\\<button>Allow</button>',
      offset: 90,
    });
    expect(screen.queryByText('Allow this Terminal more access?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow and restart' })).toBeNull();
    expect(harness.session.calls.decideAccess).toEqual([]);
    expect(open).not.toHaveBeenCalled();

    harness.options().onLinkActivate('https://tau.new/');
    expect(open).toHaveBeenCalledExactlyOnceWith('https://tau.new/', '_blank', 'noopener,noreferrer');
  });

  it('keeps the shell running when a stale decision is refused', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit({
      type: 'refused',
      code: 'request-expired',
      message: 'That access request expired.',
      recovery: 'Ask again.',
    });
    expect(screen.getByText('That access request expired. Ask again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
  });

  it('shows the typed host refusal, such as Windows sandbox-unavailable, with a retry', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start Terminal' }));
    harness.emit({
      type: 'refused',
      code: 'sandbox-unavailable',
      message: 'This computer has no shell sandbox Tau can use yet.',
      recovery: 'Use the typed Tau tools.',
    });
    expect(
      screen.getByText('This computer has no shell sandbox Tau can use yet. Use the typed Tau tools.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers a new session after the shell exits, and only on a press', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    expect(screen.getByText('The shell exited. Exit code 0.')).toBeInTheDocument();
    expect(harness.open).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Start a new Terminal' }));
    expect(harness.open).toHaveBeenCalledTimes(2);
  });

  it('ends the session when the pane closes or the Terminal stops being available', async () => {
    const { rerender, unmount } = render(
      <TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />,
    );
    await startTerminal();
    rerender(
      <TerminalPane
        availability={{ status: 'unavailable', message: 'Gone.', recovery: 'Reopen.' }}
        loadRenderer={harness.loadRenderer}
      />,
    );
    expect(harness.session.calls.close).toHaveLength(1);
    expect(harness.view.dispose).toHaveBeenCalledOnce();

    harness = createHarness();
    rerender(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    unmount();
    expect(harness.session.calls.close).toHaveLength(1);
    expect(harness.view.dispose).toHaveBeenCalledOnce();
  });

  it('restarts only after the host has ended the running session', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(harness.session.calls.close).toHaveLength(1);
    expect(harness.open).toHaveBeenCalledOnce();
    harness.emit({ type: 'exited', exitCode: null, signal: 'SIGHUP', reason: 'closed' });
    await vi.waitFor(() => {
      expect(harness.open).toHaveBeenCalledTimes(2);
    });
  });

  it('never restarts on its own after a restart the host refused', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    harness.emit({
      type: 'refused',
      code: 'sandbox-unavailable',
      message: 'This computer has no shell sandbox Tau can use yet.',
      recovery: 'Use the typed Tau tools.',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    harness.emit(opened);
    expect(harness.open).toHaveBeenCalledTimes(2);
    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    expect(screen.getByText('The shell exited. Exit code 0.')).toBeInTheDocument();
    expect(harness.open).toHaveBeenCalledTimes(2);
  });

  it('finds in screen and scrollback from the pane chrome', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Find in Terminal' }), 'error{Enter}');
    expect(harness.view.search).toHaveBeenCalledWith('error', false);
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(harness.view.search).toHaveBeenLastCalledWith('error', true);
    await userEvent.keyboard('{Escape}');
    expect(harness.view.clearFind).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox', { name: 'Find in Terminal' })).toBeNull();
  });

  it('moves focus to the pane chrome on the documented leave key', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    act(() => {
      harness.options().onLeave();
    });
    expect(document.activeElement).toHaveAttribute('data-slot', 'terminal-chrome');
    expect(screen.getByRole('button', { name: 'Screen reader mode' })).toHaveAttribute('aria-pressed', 'true');
  });
});

type PanelApi = { close: Mock<() => void>; setActive: Mock<() => void> };

/** The pane as Dockview hosts it: its close affordances reach it through `closePanel` on the panel's api. */
function DockedTerminal({
  api,
  hide,
  availability,
}: {
  readonly api: PanelApi;
  readonly hide: () => void;
  readonly availability: TerminalAvailability;
}): React.JSX.Element {
  const closeHost = useDockviewTerminalCloseHost(api, hide);
  return (
    <TerminalCloseContext.Provider value={closeHost}>
      <TerminalPane availability={availability} loadRenderer={harness.loadRenderer} />
    </TerminalCloseContext.Provider>
  );
}

describe('TerminalPane close (T15)', () => {
  let api: PanelApi;
  let hide: Mock<() => void>;
  beforeEach(() => {
    api = { close: vi.fn<() => void>(), setActive: vi.fn<() => void>() };
    hide = vi.fn<() => void>();
  });
  const requestClose = (): void => {
    act(() => {
      closePanel(api);
    });
  };
  const decision = (): HTMLElement => screen.getByRole('alertdialog', { name: 'Close the Terminal in project-1?' });

  it('closes at once when no session was started or the session has ended', async () => {
    render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    requestClose();
    expect(api.close).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await startTerminal();
    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    requestClose();
    expect(api.close).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before closing a running session, idle prompt included, without claiming a command is busy', async () => {
    render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    requestClose();

    expect(api.close).not.toHaveBeenCalled();
    expect(api.setActive).toHaveBeenCalledOnce();
    expect(harness.session.calls.close).toHaveLength(0);
    expect(decision()).toHaveAccessibleDescription(
      'Closing this Terminal stops its session. Hide keeps it running out of sight.',
    );
    expect(decision()).not.toHaveTextContent(/command|busy/iu);
    const buttons = within(decision()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Keep open', 'Hide', 'Close and stop']);
    expect(buttons[0]).toHaveFocus();

    /* A second request while the question is open does not stack another. */
    requestClose();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(api.close).not.toHaveBeenCalled();
  });

  it('Keep open, by button or Escape, leaves the session and the pane as they were', async () => {
    render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    vi.mocked(harness.view.focus).mockClear();
    requestClose();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(harness.view.focus).toHaveBeenCalledOnce();

    requestClose();
    await userEvent.click(within(decision()).getByRole('button', { name: 'Keep open' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.close).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
    expect(harness.session.calls.close).toHaveLength(0);
    harness.emit({ type: 'output', data: 'still here', offset: 10 });
    expect(harness.view.writes.at(-1)?.data).toBe('still here');
  });

  it('Hide puts the pane out of sight with its session still running', async () => {
    render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    requestClose();
    await userEvent.click(within(decision()).getByRole('button', { name: 'Hide' }));
    expect(hide).toHaveBeenCalledOnce();
    expect(api.close).not.toHaveBeenCalled();
    expect(harness.session.calls.close).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Close and stop ends the session once, removes the pane, and ignores the old session afterwards', async () => {
    const { unmount } = render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    await userEvent.keyboard('ls');
    requestClose();
    await userEvent.click(within(decision()).getByRole('button', { name: 'Close and stop' }));
    expect(harness.session.calls.close).toHaveLength(1);
    expect(harness.view.dispose).toHaveBeenCalledOnce();
    expect(api.close).toHaveBeenCalledOnce();

    const writes = harness.view.writes.length;
    harness.emit({ type: 'output', data: 'late', offset: 4 });
    harness.view.type('late input');
    expect(harness.view.writes).toHaveLength(writes);
    expect(harness.session.calls.input).toEqual([]);
    unmount();
    expect(harness.session.calls.close).toHaveLength(1);
  });

  it('withdraws the question when the session ends while it is open, and the next close needs no answer', async () => {
    render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    requestClose();
    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.close).not.toHaveBeenCalled();

    /* A new session does not bring the old question back. */
    await userEvent.click(screen.getByRole('button', { name: 'Start a new Terminal' }));
    harness.emit(opened);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    requestClose();
    expect(api.close).toHaveBeenCalledOnce();
  });

  it('withdraws the question on a project change, which ends the old session without asking', async () => {
    const { rerender } = render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    requestClose();
    rerender(<DockedTerminal api={api} hide={hide} availability={available(harness, '/home/me/Tau/project-2')} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(harness.session.calls.close).toHaveLength(1);
    expect(api.close).not.toHaveBeenCalled();
  });

  it('stops answering for the panel once the pane unmounts', async () => {
    const { unmount } = render(<DockedTerminal api={api} hide={hide} availability={available(harness)} />);
    await startTerminal();
    unmount();
    requestClose();
    expect(api.close).toHaveBeenCalledOnce();
  });
});

describe('TerminalPane project change (T15)', () => {
  it('keeps the old session out of the new project and starts the new one clean, with nothing replayed', async () => {
    const first = harness;
    const { rerender } = render(<TerminalPane availability={available(first)} loadRenderer={first.loadRenderer} />);
    await startTerminal();
    first.view.type('make build\r');
    expect(first.session.calls.input).toEqual([['make build\r']]);

    harness = createHarness();
    const second = harness;
    rerender(
      <TerminalPane availability={available(second, '/home/me/Tau/project-2')} loadRenderer={second.loadRenderer} />,
    );
    expect(first.session.calls.close).toHaveLength(1);
    expect(first.view.dispose).toHaveBeenCalledOnce();
    /* Nothing starts by itself in the new project (D21). */
    expect(second.open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start Terminal' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Start Terminal' }));
    second.emit({
      type: 'opened',
      session: { id: 'session-2', projectLabel: 'project-2', access: { read: [], write: [], domains: [] } },
    });
    expect(second.open).toHaveBeenCalledExactlyOnceWith(
      { projectRoot: '/home/me/Tau/project-2', size: { columns: 120, rows: 30 } },
      expect.any(Function),
    );

    /* The old session's late frames and the old view's input reach nothing in the new project. */
    first.emit({ type: 'output', data: 'old project output', offset: 18 });
    first.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'project-changed' });
    first.view.type('rm -rf build\r');
    expect(second.view.writes).toEqual([]);
    expect(first.view.writes).toEqual([]);
    expect(second.session.calls.input).toEqual([]);
    expect(first.session.calls.input).toEqual([['make build\r']]);
    expect(screen.getByText('project-2')).toBeInTheDocument();
    expect(screen.queryByText(/project changed/iu)).toBeNull();
  });
});
