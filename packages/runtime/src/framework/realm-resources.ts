import type { KernelIssue } from '#types/runtime.types.js';
import type { RealmHold, RealmResources } from '#types/runtime-kernel.types.js';

type Entry = {
  readonly key: string;
  readonly value: Promise<unknown>;
  readonly dispose: ((value: unknown) => void) | undefined;
  holders: number;
};

const realmConflict = (group: string, heldKey: string, requestedKey: string): Error => {
  const message = `This realm already holds "${heldKey}" for "${group}" and cannot also hold "${requestedKey}".`;
  const issue: KernelIssue = {
    code: 'KERNEL_REALM_CONFLICT',
    message,
    severity: 'error',
    type: 'kernel',
    details: { group, heldKey, requestedKey },
  };
  return Object.assign(new Error(message), { issues: [issue] });
};

/**
 * Create one registry of realm-shared resources.
 *
 * The runtime keeps a single realm-global instance ({@link realmResources}), so every kernel worker
 * in a JavaScript realm shares it; tests create isolated ones.
 *
 * @returns Realm resources with promise-guarded, refcounted holds.
 * @internal
 */
export const createRealmResources = (): RealmResources => {
  const entries = new Map<string, Entry>();

  const hold = async <Value>(input: {
    readonly group: string;
    readonly key: string;
    readonly create: () => Promise<Value>;
    readonly dispose?: (value: Value) => void;
  }): Promise<RealmHold<Value>> => {
    const { group, key } = input;
    let entry = entries.get(group);
    while (entry && entry.key !== key) {
      const other = entry;
      // A pending creation of another key decides the conflict only once it settles: a failure frees the group.
      // oxlint-disable-next-line no-await-in-loop -- each settled creation may hand the group to yet another key.
      const created = await other.value.then(
        () => true,
        () => false,
      );
      if (created && entries.get(group) === other) {
        throw realmConflict(group, other.key, key);
      }
      entry = entries.get(group);
    }
    if (!entry) {
      entry = { key, value: input.create(), dispose: input.dispose as Entry['dispose'], holders: 0 };
      entries.set(group, entry);
    }

    const held = entry;
    held.holders += 1;
    let value: Value;
    try {
      value = (await held.value) as Value;
    } catch (error) {
      held.holders -= 1;
      // A failed creation clears the guard so the next holder retries.
      if (entries.get(group) === held) {
        entries.delete(group);
      }
      throw error;
    }

    let released = false;
    return {
      value,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        held.holders -= 1;
        if (held.holders === 0 && entries.get(group) === held) {
          entries.delete(group);
          held.dispose?.(value);
        }
      },
    };
  };

  return { hold };
};

const realmResourcesKey: unique symbol = Symbol.for('@taucad/runtime/realm-resources');
const realmGlobal = globalThis as { [realmResourcesKey]?: RealmResources };
realmGlobal[realmResourcesKey] ??= createRealmResources();

/**
 * The realm's one resource registry, shared by every kernel worker the runtime hosts in this realm.
 *
 * It lives on `globalThis` so that duplicate copies of the runtime in one realm share it too.
 * @internal
 */
export const realmResources: RealmResources = realmGlobal[realmResourcesKey];
