import { Topic } from '@taucad/events';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import type { ParameterDraft, ParameterDraftKey, ParameterSetService } from '#services/parameter-set-service.js';

const identity = { manifestRevision: 'manifest' };

export const createConfigurationParameterOwner = (): Readonly<{
  parameterService: ParameterSetService;
}> => {
  const snapshots = new Map<string, ReturnType<ParameterSetService['snapshot']>>();
  const drafts = new Map<string, ParameterDraft>();
  const draftChanges = new Topic<void>({ name: 'ConfigurationParameterOwner.drafts' });
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
    draft: (key: ParameterDraftKey) => drafts.get(JSON.stringify([key.target.entry, key.editorInstance, key.pointer])),
    setDraft: (key: ParameterDraftKey, draft: ParameterDraft | undefined) => {
      const mapKey = JSON.stringify([key.target.entry, key.editorInstance, key.pointer]);
      if (draft === undefined) {
        drafts.delete(mapKey);
      } else {
        drafts.set(mapKey, draft);
      }
      draftChanges.emit();
    },
    subscribeDrafts: (listener: () => void) => draftChanges.subscribe(listener),
    commitValue: async (
      target: { entry: string },
      _manifest: unknown,
      field: { pointer: string; value: JSONValue },
    ) => {
      const values = { ...(snapshots.get(target.entry)?.entry.groups['default']?.values ?? {}) };
      values[field.pointer.slice(1)] = field.value;
      store(target.entry, values);
      return { status: 'committed', requestId: 'test', write: 'applied', revision: identity };
    },
    submitTarget: async (_target: unknown, _manifest: unknown, request: { requestId: string }) => ({
      status: 'committed',
      requestId: request.requestId,
      write: 'applied',
      revision: identity,
    }),
  } as unknown as ParameterSetService;
  return { parameterService };
};
