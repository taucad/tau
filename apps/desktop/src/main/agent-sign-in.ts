/**
 * Main's half of the external-agent sign-in tab (ACP agent policy rule 10; desktop Bash/Terminal blueprint D19/D20
 * amendment, operator ruling 2026-11-16T23:07Z).
 *
 * The one process Tau starts outside the Terminal's sandbox, and only this one: the agent's own CLI, found by main's
 * discovery, with the profile's login arguments and the environment its adapter gets, never a shell. The page names an
 * agent id and nothing else, so it cannot choose what runs. The CLI starts only when the person presses Enter on the
 * filled-in command (`start`), and the tab ends when the CLI exits.
 *
 * Main relays the person's keystrokes to the PTY and the PTY's output to the page, and reads, parses, logs or keeps
 * neither: a vendor's sign-in URL, a pasted code or a printed token passes through as opaque terminal data. The log
 * names the agent and the exit code only.
 */

import type { IpcMain, IpcMainEvent, MessagePortMain } from 'electron';
import {
  agentSignInClientFrameSchema,
  agentSignInIdSchema,
  desktopAgentSignInChannels,
} from '@taucad/types/desktop-agent-sign-in';
import type { AgentSignInHostFrame, AgentSignInRefusal } from '@taucad/types/desktop-agent-sign-in';
import { terminalLimits } from '@taucad/types/desktop-terminal';

/** What to start for one agent: `acpLoginLaunch` from `@taucad/host`. */
export type AgentSignInLaunch = Readonly<{
  file: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  commandLine: string;
}>;

/** The parts of a node-pty terminal this module uses. */
export type AgentSignInPty = {
  onData: (listener: (data: string) => void) => unknown;
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => unknown;
  write: (data: string) => void;
  resize: (columns: number, rows: number) => void;
  kill: () => void;
};

/** The part of node-pty this module uses. */
export type AgentSignInPtyBinding = {
  spawn: (
    file: string,
    args: readonly string[],
    options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> },
  ) => AgentSignInPty;
};

/** Options for {@link registerAgentSignIn}. */
export type AgentSignInOptions = {
  readonly ipcMain: Pick<IpcMain, 'on'>;
  /** Whether a sender frame is the app's own top-level document. */
  readonly trusted: (frame: unknown) => boolean;
  /**
   * The launch for an agent main's discovery lists, located again now; `undefined` when it lists none or the agent has
   * no sign-in command. Throws an error whose `code` is `CLI_NOT_FOUND` when the CLI has gone.
   */
  readonly launchOf: (agentId: string) => AgentSignInLaunch | undefined;
  /** Load node-pty. */
  readonly loadPty: () => Promise<AgentSignInPtyBinding>;
  /** A fresh `MessageChannelMain`. */
  readonly createChannel: () => { port1: MessagePortMain; port2: MessagePortMain };
  /** Where the CLI starts when its environment names no `HOME`. */
  readonly home: string;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: Readonly<Record<string, unknown>>) => void;
};

/** The registered sign-in relay. */
export type AgentSignIn = {
  /** Stop every sign-in CLI and close its tab (quit). */
  closeAll(): void;
  /** Agents with an open sign-in tab. */
  sessions(): number;
};

type Session = {
  readonly agentId: string;
  readonly port: MessagePortMain;
  started: boolean;
  ended: boolean;
  pty?: AgentSignInPty | undefined;
};

/** The frame that ends a sign-in main will not start or continue. */
type RefusedFrame = Extract<AgentSignInHostFrame, { type: 'refused' }>;

const refusal = (code: AgentSignInRefusal['code'], message: string): RefusedFrame => ({
  type: 'refused',
  code,
  message,
});

const notFound = refusal(
  'agent-not-found',
  'Tau has not found this agent on this computer. Reopen the agent menu, then try again.',
);
const cliGone = refusal(
  'cli-not-found',
  "The agent's command-line tool is no longer installed where Tau found it. Reinstall it, then try again.",
);

/** Whether an error is the host's typed "the CLI is gone" refusal. */
const isCliNotFound = (error: unknown): boolean =>
  error instanceof Object && 'code' in error && error.code === 'CLI_NOT_FOUND';

/** A launch, or the refusal that replaces it. */
const launchFor = (options: AgentSignInOptions, agentId: string): AgentSignInLaunch | RefusedFrame => {
  try {
    return options.launchOf(agentId) ?? notFound;
  } catch (error) {
    return isCliNotFound(error) ? cliGone : refusal('pty-unavailable', 'Tau could not prepare the sign-in.');
  }
};

/** Split output under the wire bound, never between the halves of a surrogate pair. */
const outputPieces = (text: string): string[] => {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > terminalLimits.outputCharacters) {
    let cut = terminalLimits.outputCharacters;
    /* Read the unit after the cut: there a trailing surrogate reads as itself, while `codePointAt` on the leading one
     * before the cut returns the whole pair's value and never looks like a surrogate. */
    const code = rest.codePointAt(cut) ?? 0;
    if (code >= 0xdc_00 && code <= 0xdf_ff) {
      cut -= 1;
    }
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) {
    pieces.push(rest);
  }
  return pieces;
};

/**
 * Register main's sign-in handler.
 *
 * @param options - IPC, the sender check, the launch seam, node-pty and the log.
 * @returns The relay, for quit.
 */
export const registerAgentSignIn = (options: AgentSignInOptions): AgentSignIn => {
  const { log } = options;
  /** At most one sign-in per agent, whichever window asked. */
  const live = new Map<string, Session>();

  const post = (session: Session, frame: AgentSignInHostFrame): void => {
    try {
      session.port.postMessage(frame);
    } catch {
      /* The page's end is gone; the session ends with it. */
    }
  };

  const end = (session: Session, frame?: AgentSignInHostFrame): void => {
    if (session.ended) {
      return;
    }
    session.ended = true;
    if (live.get(session.agentId) === session) {
      live.delete(session.agentId);
    }
    const { pty } = session;
    session.pty = undefined;
    try {
      pty?.kill();
    } catch {
      /* Already gone. */
    }
    if (frame) {
      post(session, frame);
    }
    session.port.close();
  };

  const start = async (session: Session, size: { columns: number; rows: number }): Promise<void> => {
    if (session.started) {
      return;
    }
    session.started = true;
    /* Located again at Enter: the file may have moved or gone since the tab opened (policy rule 4). */
    const launch = launchFor(options, session.agentId);
    if ('type' in launch) {
      log('warn', 'agent-sign-in.refused', { agentId: session.agentId, code: launch.code });
      end(session, launch);
      return;
    }
    let binding: AgentSignInPtyBinding;
    try {
      binding = await options.loadPty();
    } catch {
      log('warn', 'agent-sign-in.refused', { agentId: session.agentId, code: 'pty-unavailable' });
      end(session, refusal('pty-unavailable', 'Tau could not open a terminal for the sign-in.'));
      return;
    }
    if (session.ended) {
      return;
    }
    const env = Object.fromEntries(
      Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    let pty: AgentSignInPty;
    try {
      pty = binding.spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: size.columns,
        rows: size.rows,
        cwd: env['HOME'] ?? options.home,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name.
        env: { ...env, TERM: 'xterm-256color' },
      });
    } catch {
      log('warn', 'agent-sign-in.refused', { agentId: session.agentId, code: 'pty-unavailable' });
      end(session, refusal('pty-unavailable', 'The sign-in could not start.'));
      return;
    }
    session.pty = pty;
    log('info', 'agent-sign-in.started', { agentId: session.agentId });
    pty.onData((data) => {
      if (!session.ended) {
        for (const piece of outputPieces(data)) {
          post(session, { type: 'output', data: piece });
        }
      }
    });
    pty.onExit(({ exitCode, signal }) => {
      if (session.ended) {
        /* Tau stopped it (tab closed, window gone, quit): not an exit the person's sign-in reached. */
        log('info', 'agent-sign-in.stopped', { agentId: session.agentId });
        return;
      }
      session.pty = undefined;
      /* A signal is never an exit 0, whatever code node-pty pairs with it: only a real exit 0 lets the chat carry on. */
      const exited: AgentSignInHostFrame = signal
        ? { type: 'exited', exitCode: null, signal: String(signal) }
        : { type: 'exited', exitCode, signal: null };
      log('info', 'agent-sign-in.exited', {
        agentId: session.agentId,
        exitCode: exited.exitCode,
        signal: exited.signal,
      });
      end(session, exited);
    });
  };

  const serve = (session: Session, message: unknown): void => {
    const parsed = agentSignInClientFrameSchema.safeParse(message);
    if (!parsed.success) {
      end(session, refusal('invalid-frame', 'The sign-in closed after an invalid message.'));
      return;
    }
    const frame = parsed.data;
    switch (frame.type) {
      case 'start': {
        void start(session, frame.size);
        break;
      }
      case 'input': {
        /* Nothing reaches the CLI before the person's Enter starts it, and nothing is read on the way. */
        session.pty?.write(frame.data);
        break;
      }
      case 'resize': {
        try {
          session.pty?.resize(frame.size.columns, frame.size.rows);
        } catch {
          /* The PTY closed before its exit arrived (EBADF); onExit reports the exit. */
        }
        break;
      }
      case 'close': {
        end(session, { type: 'exited', exitCode: null, signal: null });
        break;
      }
    }
  };

  options.ipcMain.on(desktopAgentSignInChannels.open, (event: IpcMainEvent, payload: unknown) => {
    if (!options.trusted(event.senderFrame)) {
      return;
    }
    const { requestId, agentId } = (payload ?? {}) as { requestId?: unknown; agentId?: unknown };
    if (typeof requestId !== 'string' || requestId === '' || requestId.length > terminalLimits.requestIdCharacters) {
      log('warn', 'agent-sign-in.invalid-request');
      return;
    }
    const answer = (message: Record<string, unknown>, ports?: MessagePortMain[]): boolean => {
      try {
        event.senderFrame?.postMessage(desktopAgentSignInChannels.port, { requestId, ...message }, ports);
        return true;
      } catch {
        return false;
      }
    };
    const id = agentSignInIdSchema.safeParse(agentId);
    if (!id.success) {
      answer({ refusal: { code: 'invalid-frame', message: 'The sign-in closed after an invalid message.' } });
      return;
    }
    const existing = live.get(id.data);
    if (existing?.started === true) {
      answer({
        refusal: { code: 'already-signing-in', message: 'A sign-in for this agent is already running in Tau.' },
      });
      return;
    }
    /* A tab that never ran its CLI (closed and reopened, or a page reloaded before its port closed) gives way. */
    if (existing) {
      end(existing, { type: 'exited', exitCode: null, signal: null });
    }
    const launch = launchFor(options, id.data);
    if ('type' in launch) {
      log('warn', 'agent-sign-in.refused', { agentId: id.data, code: launch.code });
      answer({ refusal: { code: launch.code, message: launch.message } });
      return;
    }
    const { port1, port2 } = options.createChannel();
    const session: Session = { agentId: id.data, port: port1, started: false, ended: false };
    live.set(id.data, session);
    port1.on('message', (message: { data: unknown }) => {
      if (!session.ended) {
        serve(session, message.data);
      }
    });
    /* The page's end closed: a reload, a crash or a closed window. */
    port1.on('close', () => {
      end(session);
    });
    port1.start();
    event.sender.once('destroyed', () => {
      end(session);
    });
    post(session, { type: 'ready', commandLine: launch.commandLine });
    if (!answer({}, [port2])) {
      port2.close();
      end(session);
    }
  });

  return {
    closeAll() {
      for (const session of live.values()) {
        end(session, { type: 'exited', exitCode: null, signal: null });
      }
    },
    sessions: () => live.size,
  };
};
