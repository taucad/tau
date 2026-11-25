/**
 * The typed preload seam for an external agent's sign-in tab (ACP agent policy rule 10).
 *
 * Preload owns the session's port; the page never holds it. The page names an agent id and nothing else. Each client
 * frame is validated before it is posted and each host frame before the page sees it. Every method returns at once,
 * the outcome of `open` (a refusal included) arrives on the listener, and each session ends with exactly one `exited`
 * or `refused` frame. Nothing here reads, keeps or forwards the terminal data beyond the page's listener.
 */

import type { IpcRenderer, IpcRendererEvent } from 'electron';
import {
  agentSignInClientFrameSchema,
  agentSignInHostFrameSchema,
  agentSignInIdSchema,
  agentSignInRefusalSchema,
  desktopAgentSignInChannels,
} from '@taucad/types/desktop-agent-sign-in';
import type {
  AgentSignInClientFrame,
  AgentSignInHostFrame,
  DesktopAgentSignInBridge,
  DesktopAgentSignInSession,
} from '@taucad/types/desktop-agent-sign-in';

/** Options for {@link createAgentSignInBridge}. */
export type AgentSignInBridgeOptions = {
  /** How long main may take to answer an `open` with a port or a refusal. Milliseconds. */
  readonly answerMilliseconds?: number;
};

const invalid: AgentSignInHostFrame = {
  type: 'refused',
  code: 'invalid-frame',
  message: 'The sign-in closed after an invalid message.',
};

/**
 * Build the bridge preload exposes as `window.tau.agentSignIn`.
 *
 * @param ipc - The preload's `ipcRenderer`.
 * @param options - The answer bound.
 * @returns The bridge.
 */
export const createAgentSignInBridge = (
  ipc: Pick<IpcRenderer, 'send' | 'on'>,
  options: AgentSignInBridgeOptions = {},
): DesktopAgentSignInBridge => {
  const answerMilliseconds = options.answerMilliseconds ?? 15_000;
  const pending = new Map<string, (event: IpcRendererEvent, payload: Record<string, unknown>) => void>();
  let requests = 0;
  let listening = false;

  const listen = (): void => {
    if (listening) {
      return;
    }
    listening = true;
    ipc.on(desktopAgentSignInChannels.port, (event, payload: unknown) => {
      const record = (payload ?? {}) as Record<string, unknown>;
      const { requestId } = record;
      const settle = typeof requestId === 'string' ? pending.get(requestId) : undefined;
      if (settle === undefined) {
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
    open(agentId, listener) {
      let finished = false;
      let port: MessagePort | undefined;
      requests += 1;
      const requestId = `agent-sign-in-${String(requests)}`;

      const deliver = (frame: AgentSignInHostFrame): void => {
        if (finished) {
          return;
        }
        if (frame.type === 'exited' || frame.type === 'refused') {
          finished = true;
          clearTimeout(answerTimer);
          pending.delete(requestId);
          port?.close();
          port = undefined;
        }
        try {
          listener(frame);
        } catch {
          /* A throwing listener is the page's own defect. */
        }
      };
      const send = (frame: AgentSignInClientFrame): void => {
        if (finished || port === undefined) {
          return;
        }
        const parsed = agentSignInClientFrameSchema.safeParse(frame);
        if (!parsed.success) {
          return;
        }
        port.postMessage(parsed.data);
      };

      const answerTimer = setTimeout(() => {
        deliver({ type: 'refused', code: 'pty-unavailable', message: 'Tau did not answer the sign-in request.' });
      }, answerMilliseconds);

      const id = agentSignInIdSchema.safeParse(agentId);
      if (id.success) {
        listen();
        pending.set(requestId, (event, payload) => {
          clearTimeout(answerTimer);
          const [relayed] = event.ports;
          if (relayed === undefined) {
            const refusal = agentSignInRefusalSchema.safeParse(payload['refusal']);
            deliver(refusal.success ? { type: 'refused', ...refusal.data } : invalid);
            return;
          }
          if (finished) {
            relayed.close();
            return;
          }
          port = relayed;
          relayed.addEventListener('message', (message: MessageEvent<unknown>) => {
            const frame = agentSignInHostFrameSchema.safeParse(message.data);
            if (!frame.success) {
              relayed.postMessage({ type: 'close' });
              deliver(invalid);
              return;
            }
            deliver(frame.data);
          });
          relayed.start();
        });
        ipc.send(desktopAgentSignInChannels.open, { requestId, agentId: id.data });
      } else {
        queueMicrotask(() => {
          deliver(invalid);
        });
      }

      const session: DesktopAgentSignInSession = {
        start(size) {
          send({ type: 'start', size });
        },
        input(data) {
          send({ type: 'input', data });
        },
        resize(size) {
          send({ type: 'resize', size });
        },
        close() {
          send({ type: 'close' });
          deliver({ type: 'exited', exitCode: null, signal: null });
        },
      };
      return session;
    },
  };
};
