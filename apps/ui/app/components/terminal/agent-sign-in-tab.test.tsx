import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { act, render as renderReact, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentSignInHostFrame,
  DesktopAgentSignInBridge,
  DesktopAgentSignInSession,
} from '@taucad/types/desktop-agent-sign-in';
import type { DesktopTerminalBridge } from '@taucad/types/desktop-terminal';
import { AgentSignInTab } from '#components/terminal/agent-sign-in-tab.js';
import { dismissAgentSignIn, requestAgentSignIn } from '#components/terminal/agent-sign-in-tabs.js';
import { TerminalTabs } from '#components/terminal/terminal-pane.js';
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
  dismissAgentSignIn('acme');
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

  it('should end when the CLI exits and say to send the message again', async () => {
    const { view, emit, onClose } = await openTab();
    view.type('\r');

    emit({ type: 'exited', exitCode: 0, signal: null });

    expect(screen.getByRole('status')).toHaveTextContent('The sign-in ended with exit code 0. Send your message again');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
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

describe('TerminalTabs', () => {
  const unavailable = { status: 'unavailable', message: 'No shell.', recovery: 'None.' } as const;

  it('should show no tabs until a sign-in is asked for', () => {
    const signIn = createBridge();
    const { loadRenderer } = createView();
    render(<TerminalTabs availability={unavailable} signInBridge={signIn.bridge} loadRenderer={loadRenderer} />);

    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it("should open a sign-in tab beside the shell without restarting the person's shell", async () => {
    const signIn = createBridge();
    const { loadRenderer } = createView();
    const terminalOpen = vi.fn(() => ({
      input: vi.fn(),
      resize: vi.fn(),
      ack: vi.fn(),
      requestAccess: vi.fn(),
      decideAccess: vi.fn(),
      close: vi.fn(),
    }));
    const availability = {
      status: 'available',
      projectRoot: '/projects/bracket',
      bridge: { open: terminalOpen } as unknown as DesktopTerminalBridge,
    } as const;
    render(<TerminalTabs availability={availability} signInBridge={signIn.bridge} loadRenderer={loadRenderer} />);
    await act(async () => undefined);
    expect(terminalOpen).toHaveBeenCalledOnce();

    act(() => {
      requestAgentSignIn('acme');
    });
    await act(async () => undefined);

    expect(screen.getByRole('tab', { name: 'Sign in to acme' })).toHaveAttribute('aria-selected', 'true');
    expect(signIn.open).toHaveBeenCalledExactlyOnceWith('acme', expect.any(Function));
    expect(terminalOpen).toHaveBeenCalledOnce();
  });

  it('should close the tab, and with it the CLI, from its close button', async () => {
    const signIn = createBridge();
    const { loadRenderer } = createView();
    render(<TerminalTabs availability={unavailable} signInBridge={signIn.bridge} loadRenderer={loadRenderer} />);
    act(() => {
      requestAgentSignIn('acme');
    });
    await act(async () => undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Close sign-in to acme' }));

    expect(signIn.session.close).toHaveBeenCalled();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('should offer no sign-in tab where this page cannot start one', () => {
    const { loadRenderer } = createView();
    render(<TerminalTabs availability={unavailable} signInBridge={undefined} loadRenderer={loadRenderer} />);
    act(() => {
      requestAgentSignIn('acme');
    });

    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
