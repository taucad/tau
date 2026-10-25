import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopTerminalBridge, DesktopTerminalSession, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
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
