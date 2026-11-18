import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { act, render as renderReact, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentSignInHostFrame,
  DesktopAgentSignInBridge,
  DesktopAgentSignInSession,
} from '@taucad/types/desktop-agent-sign-in';
import { AgentSignInTab } from '#components/terminal/agent-sign-in-tab.js';
import {
  requestAgentSignIn,
  subscribeAgentSignIns,
  takeAgentSignInSuccess,
  useAgentSignInOutcome,
} from '#components/terminal/agent-sign-ins.js';
import type { TerminalRendererLoader } from '#components/terminal/terminal-view-options.js';
import type { TerminalRendererView } from '#components/terminal/terminal-renderer.js';

const render = (ui: React.ReactNode) => renderReact(ui, { wrapper: KeyboardProvider });

/** A fake preload bridge recording what the tab asks of main. */
const createBridge = () => {
  let listener: ((frame: AgentSignInHostFrame) => void) | undefined;
  const session = {
    start: vi.fn<DesktopAgentSignInSession['start']>(),
    input: vi.fn<DesktopAgentSignInSession['input']>(),
    resize: vi.fn<DesktopAgentSignInSession['resize']>(),
    close: vi.fn<DesktopAgentSignInSession['close']>(),
  };
  const open = vi.fn((_agentId: string, next: (frame: AgentSignInHostFrame) => void) => {
    listener = next;
    return session;
  });
  const bridge: DesktopAgentSignInBridge = { open };
  return {
    bridge,
    open,
    session,
    emit(frame: AgentSignInHostFrame) {
      act(() => {
        listener?.(frame);
      });
    },
  };
};

/** A fake renderer: what the tab draws, and a way to type into it. */
const createView = () => {
  const writes: string[] = [];
  let dataListener: ((data: string) => void) | undefined;
  const view = {
    writes,
    type(data: string) {
      act(() => {
        dataListener?.(data);
      });
    },
    renderer: (): 'webgl' => 'webgl',
    write(data: string, painted: () => void) {
      writes.push(data);
      painted();
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
  } satisfies TerminalRendererView & Record<string, unknown>;
  const loadRenderer: TerminalRendererLoader = async () => view;
  return { view, loadRenderer };
};

const ready: AgentSignInHostFrame = { type: 'ready', commandLine: "'/Users/someone/.acme/bin/acme' account sign-in" };

const openTab = async () => {
  /* As a chat's login card asks for it: the chat is the one a success carries on. */
  requestAgentSignIn('acme', 'chat-1');
  const signIn = createBridge();
  const { view, loadRenderer } = createView();
  const onClose = vi.fn();
  const rendered = render(
    <AgentSignInTab agentId='acme' bridge={signIn.bridge} loadRenderer={loadRenderer} onClose={onClose} />,
  );
  await act(async () => undefined);
  signIn.emit(ready);
  return { ...signIn, view, onClose, ...rendered };
};

afterEach(() => {
  /* A fresh request forgets how the last sign-in ended. */
  requestAgentSignIn('acme', 'chat-1');
});

describe('AgentSignInTab', () => {
  it('should name only the agent to main', async () => {
    const { open } = await openTab();

    expect(open).toHaveBeenCalledExactlyOnceWith('acme', expect.any(Function));
  });

  it('should fill in the command main chose and run nothing until Enter', async () => {
    const { view, session } = await openTab();

    expect(view.writes.join('')).toContain("$ '/Users/someone/.acme/bin/acme' account sign-in");
    expect(session.start).not.toHaveBeenCalled();
    view.type('x');
    expect(session.start).not.toHaveBeenCalled();
    expect(session.input).not.toHaveBeenCalled();
  });

  it('should run the command on Enter, without sending the Enter itself to the CLI', async () => {
    const { view, session } = await openTab();

    view.type('\r');

    expect(session.start).toHaveBeenCalledExactlyOnceWith({ columns: 120, rows: 30 });
    expect(session.input).not.toHaveBeenCalled();
  });

  it('should run the command on the Run button too', async () => {
    const { session } = await openTab();

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(session.start).toHaveBeenCalledOnce();
  });

  it("should relay the person's keys to the running CLI and draw its output", async () => {
    const { view, session, emit } = await openTab();
    view.type('\r');

    view.type('pasted-code\r');
    emit({ type: 'output', data: 'Signed in.\r\n' });

    expect(session.input).toHaveBeenCalledExactlyOnceWith('pasted-code\r');
    expect(view.writes.at(-1)).toBe('Signed in.\r\n');
  });

  it('should end when the CLI exits 0, say Tau carries on, and report the exit alone', async () => {
    const { view, emit, onClose } = await openTab();
    view.type('\r');

    emit({ type: 'exited', exitCode: 0, signal: null });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Signed in. The chat that asked continues where acme stopped, as soon as it is open.',
    );
    expect(takeAgentSignInSuccess('acme', 'chat-1')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should show the exit status of a failed sign-in and report it for the card', async () => {
    const { view, emit } = await openTab();
    view.type('\r');
    const changes = vi.fn();
    const unsubscribe = subscribeAgentSignIns(changes);

    emit({ type: 'exited', exitCode: 1, signal: null });
    unsubscribe();

    expect(screen.getByRole('status')).toHaveTextContent('The sign-in ended with exit code 1.');
    expect(changes).toHaveBeenCalled();
    expect(takeAgentSignInSuccess('acme', 'chat-1')).toBe(false);
    function Outcome(): React.JSX.Element {
      const outcome = useAgentSignInOutcome('acme', 'chat-1');
      return <p data-testid='outcome'>{typeof outcome === 'object' ? String(outcome.exitCode) : String(outcome)}</p>;
    }
    render(<Outcome />);
    expect(screen.getByTestId('outcome')).toHaveTextContent('1');
  });

  it('should never count a CLI a signal stopped as signed in', async () => {
    const { view, emit } = await openTab();
    view.type('\r');

    emit({ type: 'exited', exitCode: null, signal: '15' });

    expect(screen.getByRole('status')).toHaveTextContent('The sign-in ended before it finished.');
    expect(takeAgentSignInSuccess('acme', 'chat-1')).toBe(false);
  });

  it('should report nothing when the tab closes before the CLI ran', async () => {
    const { unmount } = await openTab();
    const changes = vi.fn();
    const unsubscribe = subscribeAgentSignIns(changes);

    unmount();
    unsubscribe();

    expect(changes).not.toHaveBeenCalled();
  });

  it('should report a stop when the tab closes while the CLI runs', async () => {
    const { view, unmount } = await openTab();
    view.type('\r');

    unmount();

    function Outcome(): React.JSX.Element {
      const outcome = useAgentSignInOutcome('acme', 'chat-1');
      return <p data-testid='outcome'>{typeof outcome === 'object' ? String(outcome.exitCode) : String(outcome)}</p>;
    }
    render(<Outcome />);
    expect(screen.getByTestId('outcome')).toHaveTextContent('undefined');
    expect(takeAgentSignInSuccess('acme', 'chat-1')).toBe(false);
  });

  it('should report nothing more when the tab closes after the CLI exited', async () => {
    const { view, emit, unmount } = await openTab();
    view.type('\r');
    emit({ type: 'exited', exitCode: 0, signal: null });
    const changes = vi.fn();
    const unsubscribe = subscribeAgentSignIns(changes);

    unmount();
    unsubscribe();

    expect(changes).not.toHaveBeenCalled();
    expect(takeAgentSignInSuccess('acme', 'chat-1')).toBe(true);
  });

  it('should start a fresh sign-in when asked again after one ended', async () => {
    const { view, emit, open } = await openTab();
    view.type('\r');
    emit({ type: 'exited', exitCode: 1, signal: null });

    act(() => {
      requestAgentSignIn('acme', 'chat-1');
    });
    await act(async () => undefined);

    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
    emit(ready);
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  it('should start a fresh sign-in when asked again after main refused one', async () => {
    const { emit, open } = await openTab();
    emit({ type: 'refused', code: 'cli-not-found', message: 'The CLI is gone.' });

    act(() => {
      requestAgentSignIn('acme', 'chat-1');
    });
    await act(async () => undefined);

    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('should only bring a running sign-in forward when asked again', async () => {
    const { view, open, session } = await openTab();
    view.type('\r');

    act(() => {
      requestAgentSignIn('acme', 'chat-2');
    });
    await act(async () => undefined);

    expect(open).toHaveBeenCalledOnce();
    expect(session.close).not.toHaveBeenCalled();
  });

  it("should show main's refusal", async () => {
    const { emit } = await openTab();

    emit({ type: 'refused', code: 'cli-not-found', message: 'The CLI is gone.' });

    expect(screen.getByRole('status')).toHaveTextContent('The CLI is gone.');
  });

  it('should keep the tab out of analytics capture and session replay', async () => {
    await openTab();

    expect(screen.getByRole('region', { name: 'Sign in to acme' })).toHaveClass('ph-no-capture');
  });

  it('should stop the CLI when the tab closes', async () => {
    const { session, view, unmount } = await openTab();

    unmount();

    expect(session.close).toHaveBeenCalled();
    expect(view.dispose).toHaveBeenCalled();
  });

  it('should draw the command line without its control characters', async () => {
    const signIn = createBridge();
    const { view, loadRenderer } = createView();
    render(<AgentSignInTab agentId='acme' bridge={signIn.bridge} loadRenderer={loadRenderer} onClose={vi.fn()} />);
    await act(async () => undefined);

    signIn.emit({ type: 'ready', commandLine: 'acme \u001B]8;;evil\u0007login' });

    expect(view.writes.join('')).toContain('$ acme ?]8;;evil?login');
  });
});
