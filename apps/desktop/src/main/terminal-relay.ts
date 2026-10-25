/**
 * Main's half of the desktop `terminal` concern (desktop Bash/Terminal blueprint W5, F6, I1).
 *
 * The pane never reaches the generic services relay for a Terminal: preload asks on its own channel and main mints
 * the port only for the app's own top-level document, for a project root the registry admits, and with the window
 * id main reads from the sender itself. A renderer cannot name another window, and a root it was never granted is
 * refused before anything reaches the services host. Every request is answered, with the port or a typed refusal,
 * so the bridge never waits on a port main has already decided not to send.
 */

import type { IpcMain, IpcMainEvent, MessagePortMain } from 'electron';
import { desktopTerminalChannels, terminalLimits, terminalProjectRootSchema } from '@taucad/types/desktop-terminal';
import type { TerminalRefusal } from '@taucad/types/desktop-terminal';

/** Options for {@link registerTerminalRelay}. */
export type TerminalRelayOptions = {
  readonly ipcMain: Pick<IpcMain, 'on'>;
  /** Whether a sender frame is the app's own top-level document. */
  readonly trusted: (frame: unknown) => boolean;
  /** Main's granted-root registry. */
  readonly isTrustedRoot: (root: string) => boolean;
  /** The id of the window that owns a sender, read by main; never a renderer-supplied value. */
  readonly windowIdOf: (sender: IpcMainEvent['sender']) => number | undefined;
  /** Mint one services-host `terminal` port for a validated context. Throws while the broker is quiescing. */
  readonly connect: (context: Readonly<{ projectRoot: string; windowId: string }>) => MessagePortMain;
  /** Whether a thrown `connect` error is the broker's quit refusal. */
  readonly isQuiescing: (error: unknown) => boolean;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
};

/**
 * Register main's terminal port handler.
 *
 * @param options - IPC, the sender and root predicates and the broker seam.
 */
export const registerTerminalRelay = (options: TerminalRelayOptions): void => {
  const { log } = options;
  options.ipcMain.on(desktopTerminalChannels.open, (event, payload: unknown) => {
    if (!options.trusted(event.senderFrame)) {
      return;
    }
    const { requestId, projectRoot } = (payload ?? {}) as { requestId?: unknown; projectRoot?: unknown };
    if (typeof requestId !== 'string' || requestId === '' || requestId.length > terminalLimits.requestIdCharacters) {
      log('warn', 'terminal.invalid-request');
      return;
    }
    const answer = (message: Record<string, unknown>, ports?: MessagePortMain[]): void => {
      try {
        event.senderFrame?.postMessage(desktopTerminalChannels.port, { requestId, ...message }, ports);
      } catch {
        /* The document that asked is gone; the port it would have had closes with it. */
        for (const port of ports ?? []) {
          port.close();
        }
      }
    };
    const refuse = (refusal: TerminalRefusal): void => {
      answer({ refusal });
    };
    const root = terminalProjectRootSchema.safeParse(projectRoot);
    if (!root.success) {
      refuse({
        code: 'invalid-frame',
        message: 'Terminal closed after an invalid message.',
        recovery: 'Reopen the pane; nothing was sent to the shell.',
      });
      return;
    }
    if (!options.isTrustedRoot(root.data)) {
      log('warn', 'terminal.untrusted-root');
      refuse({
        code: 'project-not-admitted',
        message: 'This project is not open in Tau.',
        recovery: 'Open the project, then start the Terminal.',
      });
      return;
    }
    const windowId = options.windowIdOf(event.sender);
    if (windowId === undefined) {
      return;
    }
    try {
      answer({}, [options.connect({ projectRoot: root.data, windowId: String(windowId) })]);
    } catch (error) {
      if (options.isQuiescing(error)) {
        refuse({
          code: 'sandbox-unavailable',
          message: 'Tau is quitting and starts no new Terminal.',
          recovery: 'Reopen Tau, then start the Terminal.',
        });
        return;
      }
      log('error', 'terminal.connect-failed', error instanceof Error ? error.message : String(error));
      refuse({
        code: 'sandbox-unavailable',
        message: 'Tau could not reach its shell service.',
        recovery: 'Restart Tau, then start the Terminal.',
      });
    }
  });
};
