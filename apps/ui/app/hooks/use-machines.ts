import { useCallback, useEffect, useState } from 'react';
import { mergeComponentObservations } from '@taucad/runtime/machine';
import type {
  MachineChannelClient,
  MachineClient,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineProvider,
} from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { failureCodeOf } from '#components/print/machine-facts.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';

/**
 * Reduce one admitted directory frame without introducing a second machine state authority.
 *
 * @param current - The projection before the frame.
 * @param frame - One frame from `MachineClient.watch`.
 * @returns The projection after the frame.
 * @public
 */
export const projectMachineDirectoryFrame = (
  current: MachineDirectorySnapshot,
  frame: MachineDirectoryFrame,
): MachineDirectorySnapshot => {
  if (frame.type === 'snapshot' || frame.type === 'resync-required') {
    return frame.snapshot;
  }
  if (frame.type === 'observed') {
    // Latest readings move outside the event tail: the cursor stays where it is.
    return {
      ...current,
      entries: current.entries.map((entry) =>
        entry.machineId === frame.machineId
          ? {
              ...entry,
              snapshot: {
                ...entry.snapshot,
                observedAt: frame.observedAt,
                components: mergeComponentObservations(entry.snapshot.components, frame.components),
              },
            }
          : entry,
      ),
    };
  }
  if (frame.event.type === 'machine-directory-removed') {
    const { machineId } = frame.event;
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.filter((entry) => entry.machineId !== machineId),
    };
  }
  const { entry } = frame.event;
  return {
    ...current,
    cursor: frame.cursor,
    // Telemetry replaces facts in place; receipt order must never choose the printer.
    entries: current.entries.some(({ machineId }) => machineId === entry.machineId)
      ? current.entries.map((candidate) => (candidate.machineId === entry.machineId ? entry : candidate))
      : [...current.entries, entry],
  };
};

/** What the Print pane and Settings read from this computer's machine directory. @public */
export type MachineDirectoryView = Readonly<{
  snapshot: MachineDirectorySnapshot | undefined;
  providers: readonly MachineProvider[];
  error: string | undefined;
  refresh: () => void;
}>;

/**
 * Subscribe to this computer's machine directory and the admitted providers.
 *
 * The host's store is the only authority: the initial list seeds the
 * projection and every later frame folds into it through
 * {@link projectMachineDirectoryFrame}. Unmount aborts the watch.
 *
 * @param client - The negotiated machines facet.
 * @returns The live directory projection.
 * @public
 */
export const useMachineDirectory = (client: MachineClient): MachineDirectoryView => {
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<MachineDirectorySnapshot>();
  const [providers, setProviders] = useState<readonly MachineProvider[]>([]);
  /* Kept with the observation that failed, so Refresh starts a new one and clears it at once (P66: the
   * effect reads `generation`, which a dependency array alone would not make it do). */
  const [failure, setFailure] = useState<Readonly<{ client: MachineClient; generation: number; message: string }>>();

  useEffect(() => {
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        const [initial, availableProviders] = await Promise.all([
          client.list({ signal: abort.signal }),
          client.listProviders({ signal: abort.signal }),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        setSnapshot(initial);
        setProviders(availableProviders);
        for await (const frame of client.watch({ cursor: initial.cursor, signal: abort.signal })) {
          setSnapshot((current) => projectMachineDirectoryFrame(current ?? initial, frame));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setFailure({ client, generation, message: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the observation loop.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client, generation]);

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  const error = failure?.client === client && failure.generation === generation ? failure.message : undefined;
  return { snapshot, providers, error, refresh };
};

/** What a person reads when another Tau app on this computer holds the printers (blueprint D6). @public */
export const printersInUseElsewhere =
  'Printers are in use by another Tau app on this computer. Quit it to use them here.';

/* The host's name for a machine store another process holds, and the lock's own code it wraps. */
const inUseElsewhereCodes: ReadonlySet<string> = new Set(['MACHINE_STORE_OWNED_ELSEWHERE', 'AUTHORITY_ALREADY_OWNED']);

/** This refusal becomes words, every other failure passes. The machine channel carries `code`, which is read typed. */
const explain = (error: unknown): unknown => {
  const code = failureCodeOf(error);
  return code !== undefined && inUseElsewhereCodes.has(code)
    ? new Error(printersInUseElsewhere, { cause: error })
    : error;
};

/** How a machines facet reaches the host: a port to it, and the channel over that port. @public */
export type MachinesConnection = Readonly<{
  dial: () => Promise<MessagePort>;
  connect: (port: MessagePort) => Promise<MachineChannelClient>;
}>;

/**
 * A machines facet over one channel at a time. The channel is dialled on the first call and
 * shared by every caller; once its port closes, or opening it fails, the next call dials again.
 *
 * @param connection - The port and the channel over it.
 * @returns The facet.
 * @public
 */
export const createMachinesFacet = ({ dial, connect }: MachinesConnection): RuntimeTransportFacet<MachineClient> => {
  let current: Promise<MachineChannelClient> | undefined;
  const open = async (): Promise<MachineChannelClient> => {
    const port = await dial();
    const client = await connect(port);
    await client.ready;
    // Nothing replaces an opening channel before it fails, so this is the promise that resolves to `client`.
    const opened = current;
    port.addEventListener(
      'close',
      () => {
        if (current === opened) {
          current = undefined;
        }
      },
      { once: true },
    );
    return client;
  };
  const channel = async (): Promise<MachineChannelClient> => {
    current ??= open();
    const opening = current;
    try {
      return await opening;
    } catch (error) {
      // It never opened: the next call dials again.
      if (current === opening) {
        current = undefined;
      }
      throw error;
    }
  };
  const call = async <Result>(use: (client: MachineClient) => Promise<Result>): Promise<Result> => {
    try {
      return await use(await channel());
    } catch (error) {
      throw explain(error);
    }
  };
  const stream = async function* <Frame>(use: (client: MachineClient) => AsyncIterable<Frame>): AsyncGenerator<Frame> {
    try {
      yield* use(await channel());
    } catch (error) {
      throw explain(error);
    }
  };
  return {
    available: true,
    listProviders: async (input) => call(async (client) => client.listProviders(input)),
    discover: (input) => stream((client) => client.discover(input)),
    beginBinding: async (input) => call(async (client) => client.beginBinding(input)),
    removeBinding: async (input) => call(async (client) => client.removeBinding(input)),
    list: async (input) => call(async (client) => client.list(input)),
    get: async (input) => call(async (client) => client.get(input)),
    watch: (input) => stream((client) => client.watch(input)),
    captureStill: async (input) => call(async (client) => client.captureStill(input)),
    checkJob: async (input) => call(async (client) => client.checkJob(input)),
    requestJob: async (input) => call(async (client) => client.requestJob(input)),
    listJobs: async (input) => call(async (client) => client.listJobs(input)),
    watchJobs: (input) => stream((client) => client.watchJobs(input)),
    resolveJob: async (input) => call(async (client) => client.resolveJob(input)),
    withdrawJob: async (input) => call(async (client) => client.withdrawJob(input)),
    applyAction: async (input) => call(async (client) => client.applyAction(input)),
    approveAction: async (input) => call(async (client) => client.approveAction(input)),
    stop: async (input) => call(async (client) => client.stop(input)),
    beginHold: async (input) => call(async (client) => client.beginHold(input)),
    renewHold: async (input) => call(async (client) => client.renewHold(input)),
    endHold: async (input) => call(async (client) => client.endHold(input)),
    reconcileOperation: async (input) => call(async (client) => client.reconcileOperation(input)),
    setTesting: async (input) => call(async (client) => client.setTesting(input)),
  };
};

const unsupportedFacet: RuntimeTransportFacet<MachineClient> = { available: false, reason: 'unsupported' };
let documentFacet: RuntimeTransportFacet<MachineClient> | undefined;

/**
 * This computer's machines facet (blueprint D6): one per document, whichever project is open or
 * none, reached through the desktop bridge. Settings, the Print pane and the printer viewer share
 * it. The web build has no machine host, so there it is `unsupported`.
 *
 * @returns The facet.
 * @public
 */
export const useMachinesFacet = (): RuntimeTransportFacet<MachineClient> => {
  const bridge = desktopBridge();
  if (bridge === undefined) {
    return unsupportedFacet;
  }
  documentFacet ??= createMachinesFacet({
    dial: async () => bridge.machines.connect(),
    connect: async (port) => {
      // Dynamic so the machine channel never enters the web bundle's eager graph.
      const { connectMachineChannel } = await import('@taucad/runtime/machine');
      return connectMachineChannel(port);
    },
  });
  return documentFacet;
};
