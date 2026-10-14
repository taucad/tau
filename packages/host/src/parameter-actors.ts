/**
 * Parameter actors over a Node host's roots: one per `(root, entry)`, each resolving its entry on that root's runtime
 * and writing its sidecar through that root's checked writes (RH-S12). The project host and `tau mcp` share them.
 */

import type { NodeFsProviderClient } from '@taucad/filesystem/backend';
import type { ParameterManifest } from '@taucad/parameters';
import { createParameterSetActor } from '@taucad/parameters/set-machine';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';
import type { Description } from '@taucad/runtime/client';
import { Actor, waitFor } from 'xstate';

import type { HostRuntimeClient } from '#agent-tools.js';
import { keyedResource } from '#keyed-resource.js';
import type { KeyedResource } from '#keyed-resource.js';

/**
 * The key one parameter actor is kept under.
 *
 * @param root - The absolute root it writes through.
 * @param entry - The entry file it edits.
 * @returns The `[root, entry]` key.
 * @internal
 */
export const parameterKey = (root: string, entry: string): string => JSON.stringify([root, entry]);
/**
 * The root a {@link parameterKey} names.
 *
 * @param key - The key.
 * @returns Its root.
 * @internal
 */
export const parameterRoot = (key: string): string => (JSON.parse(key) as [string, string])[0];

const manifestOf = (result: Description): ParameterManifest => {
  if (!result.success) {
    throw Object.assign(
      new Error(result.issues.map(({ message }) => message).join('; ') || 'Parameter resolution failed.'),
      { code: result.issues[0]?.code ?? 'PARAMETER_RESOLUTION_FAILED' },
    );
  }
  return result.parameters;
};

/** How long a parameter actor may take to finish its last write when its host closes (D16). Milliseconds. */
const parameterCloseBound = 10_000;

/* `ParameterSetActor` hides the runtime's `stop`; the actor `createActor` made has it. */
const stopParameterActor = (actor: ParameterSetActor): void => {
  if (actor instanceof Actor) {
    actor.stop();
  }
};

/**
 * Close one parameter actor once its last write is known. One whose write stays uncertain, or does not settle within
 * the bound, is stopped, not left running after its host, and reported; a stopped actor was closed and reported
 * already, so a retried close passes it (W6.r2 M1).
 *
 * @param actor - The parameter actor.
 * @param key - Its `[root, entry]` key.
 * @returns Once the actor is closed.
 * @internal
 */
export const closeParameterActor = async (actor: ParameterSetActor, key: string): Promise<void> => {
  if (actor.getSnapshot().status === 'stopped') {
    return;
  }
  actor.send({ type: 'close' });
  const state = await waitFor(
    actor,
    (snapshot) => snapshot.status === 'done' || snapshot.matches({ open: 'uncertain' }),
    { timeout: parameterCloseBound },
  ).catch((error: unknown) => {
    stopParameterActor(actor);
    throw error;
  });
  if (state.status !== 'done') {
    stopParameterActor(actor);
    throw new Error(`Parameter write for ${(JSON.parse(key) as [string, string])[1]} remains uncertain.`);
  }
};

/** What {@link createParameterActors} opens for a root. @internal */
export type ParameterActorsOptions = Readonly<{
  /** The rooted provider one root's actors read, watch and write through. */
  open: (root: string) => NodeFsProviderClient;
  /** The runtime client that resolves one root's entries. */
  runtimeClient: (root: string) => Promise<Pick<HostRuntimeClient, 'describe'>>;
}>;

/**
 * Parameter actors keyed by {@link parameterKey}, created on first use and closed through {@link closeParameterActor}.
 *
 * @param options - Each root's provider and runtime client.
 * @returns The keyed actors.
 * @internal
 */
export const createParameterActors = (options: ParameterActorsOptions): KeyedResource<string, ParameterSetActor> =>
  keyedResource<string, ParameterSetActor>(async (key) => {
    const [root, entry] = JSON.parse(key) as [string, string];
    const runtime = await options.runtimeClient(root);
    const provider = options.open(root);
    return createParameterSetActor({
      target: { authority: provider.id, root, entry },
      files: {
        watchReady: (request, onEvent) => {
          const closed = Promise.withResolvers<void>();
          /* A Node watch ends on its own only with its channel, which delivers a last `reset` and then refuses every
           * request: that watch closed (`WATCH_CLOSED`). A reset the channel outlives lost events (`WATCH_RESET`), and the actor re-arms and reloads. */
          const forward = (event: Readonly<{ type: string }>): void => {
            if (event.type !== 'reset') {
              onEvent(event);
              return;
            }
            // async-iife: bootstrap -- a watch event has no caller; the probe decides which failure the actor sees.
            void (async (): Promise<void> => {
              try {
                await provider.exists(request.paths[0] ?? '');
              } catch (error) {
                if (error instanceof Error && error.name === 'NodeFsChannelClosedError') {
                  closed.resolve();
                  return;
                }
              }
              onEvent(event);
            })();
          };
          const opened = provider.watch(request, forward);
          const ready = async (): Promise<void> => {
            await opened;
          };
          return {
            ready: ready(),
            closed: closed.promise,
            unsubscribe: () => {
              // async-iife: bootstrap -- `unsubscribe` is synchronous; a watch that never opened has nothing to stop.
              void (async (): Promise<void> => {
                try {
                  const stop = await opened;
                  stop();
                } catch {
                  /* Never opened. */
                }
              })();
            },
          };
        },
        exists: async (path) => provider.exists(path),
        readFile: async (path) => provider.readFile(path),
        writeFileChecked: async (write) => provider.writeFileChecked(write),
      },
      resolve: async ({ entry: source }, signal, resolution) =>
        manifestOf(
          await runtime.describe({
            source: { path: source },
            ...(resolution === undefined ? {} : { resolution }),
            signal,
          }),
        ),
    });
  }, closeParameterActor);
