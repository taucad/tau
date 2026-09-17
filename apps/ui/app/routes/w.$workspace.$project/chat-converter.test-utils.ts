import { createActor } from 'xstate';
import { Topic } from '@taucad/events';
import { fileParameterRecordProfile } from '@taucad/types';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import { parameterInputMachine } from '@taucad/parameters/input-machine';
import type { ParameterInputMachineInput } from '@taucad/parameters/input-machine';
import type {
  ParameterInputRequest,
  ParameterSetService,
  RetainedParameterInput,
} from '#services/parameter-set-service.js';

const identity = {
  sourceRevision: 'source',
  manifestRevision: 'manifest',
  valueRevision: 'value',
  dependencyRevision: 'dependency',
};

export const createConfigurationParameterOwner = (): Readonly<{
  parameterService: ParameterSetService;
}> => {
  const snapshots = new Map<string, ReturnType<ParameterSetService['snapshot']>>();
  const inputs = new Map<string, RetainedParameterInput>();
  /** Readers select from the authority actor, so the fake notifies its subscribers like one. */
  const changes = new Map<string, Topic<void>>();
  const changesFor = (entry: string): Topic<void> => {
    let topic = changes.get(entry);
    if (topic === undefined) {
      topic = new Topic<void>({ name: `ConfigurationParameterOwner.${entry}` });
      changes.set(entry, topic);
    }
    return topic;
  };
  const store = (entry: string, values: Readonly<Record<string, JSONValue>>) => {
    const record: FileParameterEntry = {
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      groups: { default: { values } },
    };
    const snapshot: NonNullable<ReturnType<ParameterSetService['snapshot']>> = {
      entry: record,
      identity,
    };
    snapshots.set(entry, snapshot);
    changesFor(entry).emit();
    return snapshot;
  };
  const parameterService = {
    target: (entry: string, authority = 'provider-configuration') => ({ authority, root: '/test', entry }),
    snapshot: (entry: string) => snapshots.get(entry),
    actor: (entry: string) =>
      snapshots.has(entry)
        ? {
            getSnapshot: () => ({ context: { current: snapshots.get(entry) } }),
            subscribe: (listener: () => void) => ({ unsubscribe: changesFor(entry).subscribe(listener) }),
          }
        : undefined,
    readSettled: async () => undefined,
    resolveTarget: async (target: { entry: string }) => snapshots.get(target.entry) ?? store(target.entry, {}),
    replaceTargetValues: async (
      target: { entry: string },
      _manifest: unknown,
      { values }: { values: Readonly<Record<string, JSONValue>> },
    ) => {
      store(target.entry, values);
    },
    input: (request: ParameterInputRequest) => {
      const key = JSON.stringify([request.binding.pointer, request.editorInstance]);
      let retained = inputs.get(key);
      if (retained === undefined) {
        const input: ParameterInputMachineInput = {
          ...request,
          acknowledgedValue: request.acknowledgedValue ?? 0,
          acknowledgedRevision: request.acknowledgedRevision ?? identity,
        };
        const actor = createActor(parameterInputMachine, { input });
        actor.start();
        retained = { actor, attach: () => () => undefined };
        inputs.set(key, retained);
      }
      return retained;
    },
    submitTarget: async (_target: unknown, _manifest: unknown, request: { requestId: string }) => ({
      status: 'committed',
      requestId: request.requestId,
      write: 'applied',
      revision: { ...identity, valueRevision: 'next' },
    }),
  } as unknown as ParameterSetService;
  return { parameterService };
};
