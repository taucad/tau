/**
 * `adapterConnection` — one ACP adapter's process group and its connection (W10 EA-S5).
 *
 * The adapter is spawned as its own process-group leader, so `terminate`
 * (SIGTERM) and `kill` (SIGKILL) reach every process it started (EA-R7). Frames
 * are validated by the ACP SDK's schemas here, at the port adapter, not on the
 * machine (EQ5). The actor has no timers: every bound is a state of
 * `acpSession`. Its cleanup kills the group, so no exit of the child leaves an
 * adapter behind.
 */

import { client } from '@agentclientprotocol/sdk';
import { createCallbackLogic } from 'xstate';
import type { CallbackActorLogic } from 'xstate';

import { isRecord } from '@taucad/utils/schema';

import { spawnAcpAdapter } from '#acp/spawn.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type {
  AcpAnswer,
  AcpCallError,
  AcpConnectionCommand,
  AcpConnectionInput,
  AcpVendorMethod,
  AcpVendorRequest,
} from '#acp/acp-session.machine.js';
import type { AcpSessionEvent } from '#acp/acp-machine-schemas.js';

/* A failed call, as the machine reads it: its code, its message, and the stderr tail beside it. */
const callError = (error: unknown, stderr: string): AcpCallError => {
  const code = isRecord(error) ? error['code'] : undefined;
  const details = isRecord(error) && isRecord(error['details']) ? error['details'] : undefined;
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a coded Tau error carries JSON details.
    ...(details === undefined ? {} : { details: details as AcpCallError['details'] }),
    stderr,
  };
};

/**
 * The connection logic `acpSession` invokes at its root.
 *
 * @param onFrame - Optional tap on every JSON-RPC frame.
 * @returns The callback logic.
 * @internal
 */
export const createAdapterConnection = (
  onFrame?: (frame: AcpWireFrame) => void,
): CallbackActorLogic<AcpConnectionCommand, AcpConnectionInput> =>
  createCallbackLogic<AcpConnectionCommand, AcpConnectionInput>(({ input, sendBack, receive }) => {
    const send = (event: AcpSessionEvent): void => {
      sendBack(event);
    };
    const adapter = spawnAcpAdapter({ adapter: input.adapter, cwd: input.cwd, ...(onFrame ? { onFrame } : {}) });
    const waiting = new Map<string, { resolve(result: unknown): void; reject(error: unknown): void }>();
    let requests = 0;
    /* A vendor request is answered by the machine's `respond`, whenever it decides. */
    const ask = async <M extends AcpVendorMethod>(method: M, params: unknown): Promise<never> => {
      const id = `vendor-${String(requests++)}`;
      const { promise, resolve, reject } = Promise.withResolvers<never>();
      waiting.set(id, { resolve: resolve as (result: unknown) => void, reject });
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the SDK validated `params` against `method`'s schema.
      send({ type: 'vendorRequest', id, request: { method, params } as unknown as AcpVendorRequest });
      return promise;
    };
    const connection = client({ name: 'tau-host' })
      .onNotification('session/update', ({ params }) => {
        send({ type: 'sessionUpdate', sessionId: params.sessionId, update: params.update });
      })
      .onRequest('session/request_permission', async ({ params }) => ask('session/request_permission', params))
      .onRequest('elicitation/create', async ({ params }) => ask('elicitation/create', params))
      .onNotification('elicitation/complete', ({ params }) => {
        send({ type: 'elicitationComplete', elicitationId: params.elicitationId });
      })
      .onRequest('fs/read_text_file', async ({ params }) => ask('fs/read_text_file', params))
      .onRequest('fs/write_text_file', async ({ params }) => ask('fs/write_text_file', params))
      .connect(adapter.stream);

    let exited = false;
    const onExit = (): void => {
      if (!exited) {
        exited = true;
        send({ type: 'adapterExited', stderr: adapter.stderr() });
      }
    };
    adapter.child.once('exit', onExit);
    /* A spawn that never started (ENOENT) emits `error` and may never emit `exit`. */
    adapter.child.once('error', () => {
      if (adapter.child.pid === undefined) {
        onExit();
      }
    });

    const call = async (command: Extract<AcpConnectionCommand, { readonly type: 'call' }>): Promise<void> => {
      const { id } = command;
      try {
        const result: unknown = await connection.agent.request(command.method, command.params);
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `result` answers `command.method`.
        send({
          type: 'callSettled',
          id,
          at: Date.now(),
          answer: { method: command.method, result } as unknown as AcpAnswer,
        });
      } catch (error) {
        send({
          type: 'callSettled',
          id,
          at: Date.now(),
          answer: { method: command.method, error: callError(error, adapter.stderr()) },
        });
      }
    };

    receive((command) => {
      switch (command.type) {
        case 'call': {
          /* The answer arrives as `callSettled`; the machine decides whether anyone still waits. */
          void call(command);
          return;
        }
        case 'notify': {
          void connection.agent.notify(command.method, command.params);
          return;
        }
        case 'respond': {
          const pending = waiting.get(command.id);
          waiting.delete(command.id);
          if ('error' in command) {
            pending?.reject(Object.assign(new Error(command.error.message), { code: command.error.code }));
          } else {
            pending?.resolve(command.result);
          }
          return;
        }
        case 'terminate': {
          adapter.signal('SIGTERM');
          return;
        }
        case 'kill': {
          adapter.signal('SIGKILL');
        }
      }
    });

    return () => {
      connection.close();
      /* Every exit of the child ends with SIGKILL to the group (EA-R7); a gone group is ESRCH. */
      adapter.signal('SIGKILL');
    };
  });
