import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { StrictMode } from 'react';
import { act, render as renderReact, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopTerminalBridge, DesktopTerminalSession, TerminalHostFrame } from '@taucad/types/desktop-terminal';
import { TerminalPane } from '#components/terminal/terminal-pane.js';
import type { TerminalRendererLoader } from '#components/terminal/terminal-pane.js';
import type { TerminalAvailability } from '#components/terminal/terminal-availability.js';
import { highContrastQuery, highContrastRatio } from '#components/terminal/terminal-theme.js';
import type { TerminalRendererOptions, TerminalRendererView } from '#components/terminal/terminal-renderer.js';

const render = (ui: React.ReactNode) => renderReact(ui, { wrapper: KeyboardProvider });

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
    setTheme: vi.fn(),
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
  await act(async () => undefined);
  harness.emit(opened);
};

describe('TerminalPane', () => {
  it.each(['frames', 'bytes'])(
    'should bound early %s and close an overflowing launch without replay',
    async (limit) => {
      harness.open.mockImplementation((_request, onFrame: (frame: TerminalHostFrame) => void) => {
        for (let index = 0; index < (limit === 'frames' ? 65 : 5); index += 1) {
          onFrame({ type: 'output', data: limit === 'frames' ? '' : 'x'.repeat(65_536), offset: (index + 1) * 65_536 });
        }
        return harness.session;
      });
      render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
      await act(async () => undefined);
      expect(harness.session.calls.close).toHaveLength(1);
      expect(harness.view.dispose).toHaveBeenCalledOnce();
      expect(harness.view.writes).toEqual([]);
      expect(harness.session.calls.ack).toEqual([]);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(harness.open).toHaveBeenCalledOnce();
    },
  );

  it('should discard early frames and late callbacks from a failed open before retry', async () => {
    let failedListener: ((frame: TerminalHostFrame) => void) | undefined;
    harness.open.mockImplementationOnce((_request, onFrame: (frame: TerminalHostFrame) => void) => {
      failedListener = onFrame;
      onFrame(opened);
      onFrame({ type: 'output', data: 'failed prompt', offset: 13 });
      throw new Error('Bridge disconnected.');
    });
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
    expect(harness.view.dispose).toHaveBeenCalledOnce();
    expect(harness.view.writes).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    act(() => {
      failedListener?.({ type: 'output', data: 'stale', offset: 18 });
    });
    harness.emit(opened);
    harness.emit({ type: 'output', data: 'new prompt', offset: 10 });
    expect(harness.view.writes.map(({ data }) => data)).toEqual(['new prompt']);
    harness.view.writes[0]!.painted();
    expect(harness.session.calls.ack).toEqual([[10]]);
    expect(harness.open).toHaveBeenCalledTimes(2);
  });

  it('should capture and acknowledge initial output delivered during open after input subscribes', async () => {
    const subscribed = vi.spyOn(harness.view, 'onData');
    vi.spyOn(harness.view, 'write').mockImplementation((data, painted) => {
      harness.view.writes.push({ data, painted });
      painted();
    });
    harness.open.mockImplementation((_request, onFrame: (frame: TerminalHostFrame) => void) => {
      expect(subscribed).toHaveBeenCalledOnce();
      onFrame(opened);
      onFrame({ type: 'output', data: 'real initial prompt> ', offset: 21 });
      return harness.session;
    });
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
    expect(harness.view.writes.map(({ data }) => data)).toEqual(['real initial prompt> ']);
    expect(harness.session.calls.ack).toEqual([[21]]);
  });

  it('should dispose a late renderer without opening after the pane unmounts', async () => {
    let ready: ((view: TerminalRendererView) => void) | undefined;
    const loading = new Promise<TerminalRendererView>((resolve) => {
      ready = resolve;
    });
    const loadRenderer = vi.fn(async () => loading);
    const { unmount } = render(<TerminalPane availability={available(harness)} loadRenderer={loadRenderer} />);
    await act(async () => undefined);
    expect(loadRenderer).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      ready?.(harness.view);
    });
    expect(harness.open).not.toHaveBeenCalled();
    expect(harness.view.dispose).toHaveBeenCalledOnce();
  });

  it('should autostart exactly once across StrictMode effects and rerenders', async () => {
    const { rerender } = render(
      <StrictMode>
        <TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />
      </StrictMode>,
    );
    await act(async () => undefined);
    expect(harness.open).toHaveBeenCalledOnce();
    rerender(
      <StrictMode>
        <TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />
      </StrictMode>,
    );
    await act(async () => undefined);
    expect(harness.open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Start Terminal' })).toBeNull();
  });

  it('should render no inner header controls', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
    harness.emit(opened);
    for (const name of ['Screen reader mode', 'Find', 'Restart', 'Request access']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('Terminal')).toBeNull();
  });

  it('should close on unmount and autostart a fresh session on reopen', async () => {
    const first = render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    expect(harness.open).toHaveBeenCalledOnce();
    first.unmount();
    expect(harness.session.calls.close).toHaveLength(1);
    harness = createHarness();
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.options().fontFamily).toContain('Geist Mono');
    expect(harness.options().fontSize).toBe(14);
    expect(harness.options().lineHeight).toBe(21);
    /* The jsdom environment resolves no tokens, so the theme falls back to black and gets the dark-background blending. */
    expect(harness.options()).toMatchObject({ textBlending: 'linear-corrected', textWeight: 1.15, fontWeight: 400 });
    expect(harness.view.focus).toHaveBeenCalled();
  });

  it('should re-theme the open Terminal when the root theme class changes', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    vi.mocked(harness.view.setTheme).mockClear();
    document.documentElement.classList.add('dark');
    await act(async () => undefined);
    document.documentElement.classList.remove('dark');
    await act(async () => undefined);
    expect(harness.view.setTheme).toHaveBeenCalledTimes(2);
  });

  it('should raise the open Terminal to the contrast floor when the contrast preference changes', async () => {
    const { matchMedia } = globalThis;
    let matches = false;
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const spy = vi.spyOn(globalThis, 'matchMedia').mockImplementation((query) => {
      const list: MediaQueryList = {
        ...matchMedia(query),
        get matches() {
          return query === highContrastQuery && matches;
        },
        addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
          if (query === highContrastQuery) {
            listeners.add(listener);
          }
        },
        removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
          listeners.delete(listener);
        },
      };
      return list;
    });
    try {
      const { unmount } = render(
        <TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />,
      );
      await startTerminal();
      expect(listeners.size).toBe(1);
      matches = true;
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener(new Event('change'));
        }
      }
      expect(harness.view.setTheme).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ minimumContrastRatio: highContrastRatio }),
      );
      unmount();
      expect(listeners.size).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('should refit and resize the session when the font loads after the Terminal opened', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit(opened);
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    try {
      harness.view.fit = () => ({ columns: 100, rows: 28 });
      act(() => {
        harness.options().onMetricsChange?.();
      });
      expect(harness.session.calls.resize.at(-1)).toEqual([{ columns: 100, rows: 28 }]);
    } finally {
      width.mockRestore();
    }
  });

  it('cannot start while the folder is still being looked up', () => {
    render(<TerminalPane availability={{ status: 'checking' }} loadRenderer={harness.loadRenderer} />);
    expect(screen.getByRole('status', { name: 'Starting Terminal' })).toHaveAttribute('aria-busy', 'true');
    expect(harness.open).not.toHaveBeenCalled();
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

  it('acknowledges nothing of a replaced shell that paints after the replacement opened', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    harness.emit({ type: 'output', data: 'old shell output\r\n', offset: 18 });
    harness.emit({ type: 'exited', exitCode: null, signal: 'SIGTERM', reason: 'replaced' });
    harness.emit(opened);
    harness.emit({ type: 'output', data: '$ ', offset: 2 });
    for (const { painted } of harness.view.writes) {
      painted();
    }
    /* The new shell's offsets start at zero: 18 would be past them, and the host would end the Terminal. */
    expect(harness.session.calls.ack).toEqual([[2]]);
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

    expect(harness.session.calls.requestAccess).toEqual([]);
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

  it('offers access through the keyboard menu and binds approval to the host request', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    screen.getByRole('region', { name: 'Terminal' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.queryByText('Screen reader mode')).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Request access' }));
    const read = screen.getByLabelText('Folders to read');
    expect(read).toHaveFocus();
    await userEvent.type(read, '/home/me/reference');
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }));
    expect(harness.session.calls.requestAccess).toEqual([[{ read: ['/home/me/reference'], write: [], domains: [] }]]);
    expect(harness.session.calls.decideAccess).toEqual([]);
    harness.emit({
      type: 'access-requested',
      requestId: 'trusted-request',
      access: { read: ['/home/me/reference'], write: [], domains: [] },
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(screen.queryByRole('form', { name: 'Request Terminal access' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Allow and restart' }));
    expect(harness.session.calls.decideAccess).toEqual([['trusted-request', 'allow']]);
  });

  it('finds through the menu and restores terminal focus on Escape', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    screen.getByRole('region', { name: 'Terminal' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Find' }));
    const find = screen.getByRole('textbox', { name: 'Find in Terminal' });
    expect(find).toHaveFocus();
    await userEvent.type(find, 'needle{Enter}');
    expect(harness.view.search).toHaveBeenCalledWith('needle', false);
    await userEvent.keyboard('{Escape}');
    expect(harness.view.clearFind).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox', { name: 'Find in Terminal' })).toBeNull();
    expect(harness.view.focus).toHaveBeenCalledTimes(2);
  });

  it('waits for the host exit before a requested restart', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    screen.getByRole('region', { name: 'Terminal' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restart' }));
    expect(harness.session.calls.close).toHaveLength(1);
    expect(harness.open).toHaveBeenCalledOnce();
    harness.emit({ type: 'exited', exitCode: 0, signal: null, reason: 'closed' });
    await act(async () => undefined);
    expect(harness.open).toHaveBeenCalledTimes(2);
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
    expect(harness.session.calls.close).toEqual([]);
    expect(harness.open).toHaveBeenCalledOnce();
  });

  it('shows the typed host refusal, such as Windows sandbox-unavailable, with a retry', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
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

  it('should not retry a refused launch on rerender', async () => {
    const { rerender } = render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
    harness.emit({ type: 'refused', code: 'sandbox-unavailable', message: 'Unavailable.', recovery: 'Try again.' });
    rerender(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await act(async () => undefined);
    expect(harness.open).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(harness.open).toHaveBeenCalledTimes(2);
  });

  it('moves focus out of terminal input on the documented leave key', async () => {
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    act(() => {
      harness.options().onLeave();
    });
    expect(screen.getByRole('region', { name: 'Terminal' })).toHaveFocus();
    expect(harness.options().screenReaderMode).toBe(true);
  });
});

describe('TerminalPane unload', () => {
  it('never holds the page unload, so closing or reloading the window asks nothing', async () => {
    const unload = (): Event => {
      const event = new Event('beforeunload', { cancelable: true });
      globalThis.dispatchEvent(event);
      return event;
    };
    render(<TerminalPane availability={available(harness)} loadRenderer={harness.loadRenderer} />);
    await startTerminal();
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument();
    expect(unload().defaultPrevented).toBe(false);
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

    await act(async () => undefined);
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
    expect(second.view.focus).toHaveBeenCalled();
    expect(screen.queryByText(/project changed/iu)).toBeNull();
  });
});
