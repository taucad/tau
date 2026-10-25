/**
 * The typed preload seam for the desktop Terminal (desktop Bash/Terminal blueprint W5, I8, I9).
 *
 * Preload owns the session's port; the page never holds it. Each client frame is validated before it is posted and
 * each host frame before the page sees it, so the page can neither send a frame the wire does not allow nor be
 * handed one the host did not mean. Every method returns at once and no promise is ever handed to the page: the
 * outcome of `open`, a refusal included, arrives on the listener, and a request main never answers is refused after
 * a bound. Each session ends with exactly one final frame: `exited` (other than `replaced`) or a `refused` other
 * than `request-expired`, which only answers a stale access decision and leaves the shell running.
 */

import type { IpcRenderer, IpcRendererEvent } from 'electron';
import {
  desktopTerminalChannels,
  terminalClientFrameSchema,
  terminalHostFrameSchema,
  terminalProjectRootSchema,
  terminalRefusalSchema,
  terminalSizeSchema,
} from '@taucad/types/desktop-terminal';
import type {
  DesktopTerminalBridge,
  DesktopTerminalSession,
  TerminalClientFrame,
  TerminalHostFrame,
  TerminalRefusal,
} from '@taucad/types/desktop-terminal';

/** Options for {@link createTerminalBridge}. */
export type TerminalBridgeOptions = {
  /** How long main may take to answer an `open` with a port or a refusal. Milliseconds. */
  readonly answerMilliseconds?: number;
};

const invalid: TerminalRefusal = {
  code: 'invalid-frame',
  message: 'Terminal closed after an invalid message.',
  recovery: 'Reopen the pane; nothing was sent to the shell.',
};

/** Whether a host frame ends the session. */
const isFinal = (frame: TerminalHostFrame): boolean =>
  (frame.type === 'exited' && frame.reason !== 'replaced') ||
  (frame.type === 'refused' && frame.code !== 'request-expired');

/**
 * Build the bridge preload exposes as `window.tau.terminal`.
 *
 * @param ipc - The preload's `ipcRenderer`.
 * @param options - The answer bound.
 * @returns The bridge.
 */
export const createTerminalBridge = (
  ipc: Pick<IpcRenderer, 'send' | 'on'>,
  options: TerminalBridgeOptions = {},
): DesktopTerminalBridge => {
  const answerMilliseconds = options.answerMilliseconds ?? 15_000;
  const pending = new Map<string, (event: IpcRendererEvent, payload: Record<string, unknown>) => void>();
  let requests = 0;
  let listening = false;

  const listen = (): void => {
    if (listening) {
      return;
    }
    listening = true;
    ipc.on(desktopTerminalChannels.port, (event, payload: unknown) => {
      const record = (payload ?? {}) as Record<string, unknown>;
      const { requestId } = record;
      const settle = typeof requestId === 'string' ? pending.get(requestId) : undefined;
      if (settle === undefined) {
        /* A late answer to a request already refused or closed: its port must not stay open. */
        for (const port of event.ports) {
          port.close();
        }
        return;
      }
      pending.delete(requestId as string);
      settle(event, record);
    });
  };

  return {
    open(request, listener) {
      let finished = false;
      let port: MessagePort | undefined;
      let size = terminalSizeSchema.safeParse(request.size).data;
      requests += 1;
      const requestId = `terminal-${String(requests)}`;

      const deliver = (frame: TerminalHostFrame): void => {
        if (finished) {
          return;
        }
        if (isFinal(frame)) {
          finished = true;
          clearTimeout(answerTimer);
          pending.delete(requestId);
          port?.close();
          port = undefined;
        }
        try {
          listener(frame);
        } catch {
          /* A throwing listener is the page's own defect; the session state above is already settled. */
        }
      };
      const send = (frame: TerminalClientFrame): void => {
        if (finished || port === undefined) {
          return;
        }
        const parsed = terminalClientFrameSchema.safeParse(frame);
        if (!parsed.success) {
          port.postMessage({ type: 'close' });
          deliver({ type: 'refused', ...invalid });
          return;
        }
        port.postMessage(parsed.data);
      };

      const projectRoot = terminalProjectRootSchema.safeParse(request.projectRoot);
      const answerTimer = setTimeout(() => {
        deliver({
          type: 'refused',
          code: 'sandbox-unavailable',
          message: "Tau's shell service did not answer.",
          recovery: 'Restart Tau, then start the Terminal.',
        });
      }, answerMilliseconds);

      const initialSize = size;
      if (!projectRoot.success || initialSize === undefined) {
        queueMicrotask(() => {
          deliver({ type: 'refused', ...invalid });
        });
      } else {
        listen();
        pending.set(requestId, (event, payload) => {
          clearTimeout(answerTimer);
          const [relayed] = event.ports;
          if (relayed === undefined) {
            const refusal = terminalRefusalSchema.safeParse(payload['refusal']);
            deliver({ type: 'refused', ...(refusal.success ? refusal.data : invalid) });
            return;
          }
          if (finished) {
            relayed.close();
            return;
          }
          port = relayed;
          relayed.addEventListener('message', (message: MessageEvent<unknown>) => {
            const frame = terminalHostFrameSchema.safeParse(message.data);
            if (!frame.success) {
              relayed.postMessage({ type: 'close' });
              deliver({ type: 'refused', ...invalid });
              return;
            }
            deliver(frame.data);
          });
          relayed.start();
          send({ type: 'open', size: initialSize });
        });
        ipc.send(desktopTerminalChannels.open, { requestId, projectRoot: projectRoot.data });
      }

      const session: DesktopTerminalSession = {
        input(data) {
          send({ type: 'input', data });
        },
        resize(next) {
          const parsed = terminalSizeSchema.safeParse(next);
          if (parsed.success) {
            size = parsed.data;
          }
          send({ type: 'resize', size: next });
        },
        ack(offset) {
          send({ type: 'ack', offset });
        },
        requestAccess(access) {
          send({ type: 'request-access', access });
        },
        decideAccess(requestId, decision) {
          send({ type: 'decide-access', requestId, decision });
        },
        close() {
          if (finished) {
            return;
          }
          if (port === undefined) {
            /* Not answered yet: the late port is closed on arrival, and the page hears the end now. */
            deliver({ type: 'exited', exitCode: null, signal: null, reason: 'closed' });
            return;
          }
          send({ type: 'close' });
          /* The host answers with `exited`; a host that is already gone cannot, so the page still hears the end. */
          setTimeout(() => {
            deliver({ type: 'exited', exitCode: null, signal: null, reason: 'closed' });
          }, answerMilliseconds);
        },
      };
      return session;
    },
  };
};
