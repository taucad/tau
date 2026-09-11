import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { ChannelServerHandle, MessagePortLike, Port } from '@taucad/rpc';
import { _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import type {
  ComputeGeneration,
  ComputeGetInput,
  ComputeGetResult,
  ComputePinInput,
  ComputePinResult,
  ComputePutInput,
  ComputePutResult,
  ComputeReleaseInput,
  ComputeStore,
  ComputeStoreControl,
  ComputeStoreEngine,
  ComputeStoreReport,
  ComputeStoreSession,
} from '#types/runtime-compute.types.js';

type SessionInput<T> = { readonly sessionId: number; readonly input: T };

type ComputeStoreProtocol = {
  readonly hello: { readonly server: 'compute-store' };
  readonly calls: {
    readonly open: {
      readonly args: undefined;
      readonly result: { readonly sessionId: number; readonly generation: number; readonly durable: boolean };
    };
    readonly get: { readonly args: SessionInput<ComputeGetInput>; readonly result: ComputeGetResult };
    readonly put: { readonly args: SessionInput<ComputePutInput>; readonly result: ComputePutResult };
    readonly pin: { readonly args: SessionInput<ComputePinInput>; readonly result: ComputePinResult };
    readonly release: {
      readonly args: SessionInput<ComputeReleaseInput>;
      readonly result: { readonly status: 'released' };
    };
    readonly close: { readonly args: { readonly sessionId: number }; readonly result: undefined };
    readonly generation: { readonly args: undefined; readonly result: number };
    readonly inspect: { readonly args: undefined; readonly result: ComputeStoreReport };
    readonly clear: { readonly args: undefined; readonly result: Awaited<ReturnType<ComputeStoreControl['clear']>> };
    readonly collect: {
      readonly args: Parameters<ComputeStoreControl['collect']>[0];
      readonly result: Awaited<ReturnType<ComputeStoreControl['collect']>>;
    };
  };
  readonly notifies: Readonly<Record<never, never>>;
  readonly listens: Readonly<Record<never, never>>;
};

const sessionKey = 'compute-store-v1';

const asPort = (port: MessagePortLike | Port<unknown>): Port<unknown> =>
  'onMessage' in port ? port : wrapMessagePort(port);

/**
 * Serve one host-minted workspace authority over a private port.
 * @param input - Trusted engine, workspace, control, and private port.
 * @returns The authority channel lifecycle handle.
 * @public
 */
export const exposeComputeStoreChannel = (input: {
  readonly port: MessagePortLike | Port<unknown>;
  readonly engine: ComputeStoreEngine;
  readonly workspace: string;
  readonly control?: ComputeStoreControl;
  readonly generation?: () => Promise<ComputeGeneration>;
}): ChannelServerHandle<ComputeStoreProtocol> => {
  const sessions = new Map<number, ComputeStoreSession>();
  let nextSessionId = 1;
  const requireControl = (): ComputeStoreControl => {
    if (!input.control) {
      throw new Error('Compute store control is unavailable on this session channel.');
    }
    return input.control;
  };
  const requireSession = (id: number): ComputeStoreSession => {
    const session = sessions.get(id);
    if (!session) {
      throw new Error('Compute store session is closed or unknown.');
    }
    return session;
  };

  const server = createChannelServer<ComputeStoreProtocol>({
    port: asPort(input.port),
    sessionKey,
    hello: { server: 'compute-store' },
    impl: {
      // oxlint-disable-next-line eslint/max-params -- typed ChannelServer call signature is fixed.
      async call(_context, name, args, signal) {
        switch (name) {
          case 'open': {
            const session = await input.engine.open({ workspace: input.workspace, signal });
            const sessionId = nextSessionId++;
            sessions.set(sessionId, session);
            return { sessionId, generation: session.generation, durable: session.durable };
          }
          case 'get': {
            const request = args as SessionInput<ComputeGetInput>;
            return requireSession(request.sessionId).get({ ...request.input, signal });
          }
          case 'put': {
            const request = args as SessionInput<ComputePutInput>;
            return requireSession(request.sessionId).put({ ...request.input, signal });
          }
          case 'pin': {
            const request = args as SessionInput<ComputePinInput>;
            return requireSession(request.sessionId).pin({ ...request.input, signal });
          }
          case 'release': {
            const request = args as SessionInput<ComputeReleaseInput>;
            return requireSession(request.sessionId).release({ ...request.input, signal });
          }
          case 'close': {
            const request = args as { readonly sessionId: number };
            const session = requireSession(request.sessionId);
            sessions.delete(request.sessionId);
            await session.close();
            return undefined;
          }
          case 'generation': {
            if (input.generation) {
              return input.generation();
            }
            const report = await requireControl().inspect({ signal });
            return report.generation;
          }
          case 'inspect': {
            return requireControl().inspect({ signal });
          }
          case 'clear': {
            return requireControl().clear({ signal });
          }
          case 'collect': {
            return requireControl().collect({ ...(args as Parameters<ComputeStoreControl['collect']>[0]), signal });
          }
        }
      },
      async *listen() {
        yield* [];
      },
    },
  });
  server.onClose(() => {
    for (const session of sessions.values()) {
      void session.close();
    }
    sessions.clear();
  });
  return server;
};

/**
 * Create a worker-realm opaque store backed by a private authority channel.
 * @param port - Private port minted by the trusted authority.
 * @returns The registered store, engine/control proxies, and lifecycle handle.
 * @internal
 */
export const createComputeStoreChannelClient = (
  port: MessagePortLike | Port<unknown>,
): {
  readonly store: ComputeStore;
  readonly engine: ComputeStoreEngine;
  readonly control: ComputeStoreControl;
  readonly dispose: () => void;
} => {
  const channel = createChannelClient<ComputeStoreProtocol>({ port: asPort(port), sessionKey });
  const engine: ComputeStoreEngine = {
    open: async () => {
      const opened = await channel.call('open');
      const { sessionId } = opened;
      return {
        generation: opened.generation as ComputeStoreSession['generation'],
        durable: opened.durable,
        get: async ({ signal, ...input }) => channel.call('get', { sessionId, input }, signal),
        put: async ({ signal, ...input }) => channel.call('put', { sessionId, input }, signal),
        pin: async ({ signal, ...input }) => channel.call('pin', { sessionId, input }, signal),
        release: async ({ signal, ...input }) => channel.call('release', { sessionId, input }, signal),
        close: async () => channel.call('close', { sessionId }),
      };
    },
  };
  const control: ComputeStoreControl = {
    inspect: async ({ signal }) => channel.call('inspect', undefined, signal),
    clear: async ({ signal }) => channel.call('clear', undefined, signal),
    collect: async ({ signal, ...input }) => channel.call('collect', input, signal),
  };
  const store = _registerComputeStore({
    spec: Object.freeze({}) as ComputeStore,
    engine,
    workspace: 'authority',
    control,
    generation: async () => (await channel.call('generation')) as ComputeStoreSession['generation'],
  });
  return {
    store,
    engine,
    control,
    dispose: () => {
      channel.close();
    },
  };
};

/**
 * Consume one private host-minted compute capability in another JavaScript realm.
 * @param port - Private port received from trusted host composition.
 * @returns The opaque store and its channel lifecycle.
 * @public
 */
export const connectComputeStoreChannel = (
  port: MessagePortLike | Port<unknown>,
): { readonly store: ComputeStore; readonly dispose: () => void } => {
  const client = createComputeStoreChannelClient(port);
  return { store: client.store, dispose: client.dispose };
};
