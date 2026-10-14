import { runtimePluginAbiVersion } from '#plugins/plugin-runtime-definition.js';
import type { KernelIssue } from '#types/runtime.types.js';
import { realmGroupState } from '#types/runtime-kernel.types.js';
import type { RealmGroup, RealmHold, RealmHoldInput, RealmResources } from '#types/runtime-kernel.types.js';

const realmRefusal = (message: string, details: Record<string, unknown>): Error => {
  const issue: KernelIssue = { code: 'KERNEL_REALM_CONFLICT', message, severity: 'error', type: 'kernel', details };
  return Object.assign(new Error(message), { issues: [issue] });
};

const foreignAbi = (heldAbi: number): Error =>
  realmRefusal(
    `This realm's shared resources belong to @taucad/runtime plugin ABI ${heldAbi}; this copy speaks ABI ${runtimePluginAbiVersion}.`,
    { reason: 'runtime', heldAbi, requestedAbi: runtimePluginAbiVersion },
  );

/**
 * Declare a backend that every kernel in a JavaScript realm shares, such as a library's module-scope WASM instance.
 *
 * Call it once, at module scope, and pass the token as `group` to `services.realm.hold`; the token fixes the
 * held value's type. A second token with a name this realm already holds is refused.
 *
 * @param name - Realm-wide name of the backend; prefix a third-party name with its package name.
 * @returns The token kernels pass to `services.realm.hold`.
 * @public
 *
 * @example <caption>Declare a third-party kernel's engine once, at module scope</caption>
 * ```typescript
 * import { createRealmGroup } from '@taucad/runtime/kernel';
 *
 * type Engine = { readonly version: string };
 * const engine = createRealmGroup<Engine>('@acme/truck-kernel/engine');
 * ```
 */
export const createRealmGroup = <Value>(name: string): RealmGroup<Value> =>
  Object.freeze({ name, [realmGroupState]: { abi: runtimePluginAbiVersion, entry: undefined } });

/** Which token holds each group name in this realm. Shared by duplicate runtime copies; part of the plugin ABI. */
type RealmDirectory = { readonly abi: number; readonly holders: Map<string, unknown> };

// The key the unstamped registry of earlier runtime copies used, so this copy refuses rather than ignores it.
const directoryKey: unique symbol = Symbol.for('@taucad/runtime/realm-resources');
// A typed view of `globalThis` with one more optional slot: reading it yields `unknown`, never a trusted shape.
const realm: typeof globalThis & { [directoryKey]?: unknown } = globalThis;

const isRealmDirectory = (value: unknown): value is RealmDirectory =>
  typeof value === 'object' &&
  value !== null &&
  'abi' in value &&
  typeof value.abi === 'number' &&
  'holders' in value &&
  value.holders instanceof Map;

/**
 * The realm's directory, created by the first runtime copy that asks; refused when another ABI wrote it.
 *
 * @returns The directory this runtime copy may share.
 */
const realmDirectory = (): RealmDirectory => {
  realm[directoryKey] ??= { abi: runtimePluginAbiVersion, holders: new Map<string, unknown>() };
  const found = realm[directoryKey];
  if (!isRealmDirectory(found)) {
    throw realmRefusal(
      `This realm's shared resources were not written by @taucad/runtime plugin ABI ${runtimePluginAbiVersion}.`,
      { reason: 'runtime', requestedAbi: runtimePluginAbiVersion },
    );
  }
  if (found.abi !== runtimePluginAbiVersion) {
    throw foreignAbi(found.abi);
  }
  return found;
};

const hold = async <Value>(input: RealmHoldInput<Value>): Promise<RealmHold<Value>> => {
  const { group, key } = input;
  const state = group[realmGroupState];
  if (state.abi !== runtimePluginAbiVersion) {
    throw foreignAbi(state.abi);
  }
  const { holders } = realmDirectory();

  let { entry } = state;
  while (entry && entry.key !== key) {
    const other = entry;
    // A pending creation of another key decides the conflict only once it settles: a failure frees the group.
    // oxlint-disable-next-line no-await-in-loop -- each settled creation may hand the group to yet another key.
    const created = await other.value.then(
      () => true,
      () => false,
    );
    if (created && state.entry === other) {
      throw realmRefusal(`This realm already holds "${other.key}" for "${group.name}" and cannot also hold "${key}".`, {
        reason: 'build',
        group: group.name,
        heldKey: other.key,
        requestedKey: key,
      });
    }
    ({ entry } = state);
  }
  if (!entry) {
    // Checked when creating, after any wait above: a token with an entry already holds its name.
    const holder = holders.get(group.name);
    if (holder !== undefined && holder !== group) {
      throw realmRefusal(
        `Another declaration of realm group "${group.name}" already holds its instance in this realm.`,
        { reason: 'declaration', group: group.name },
      );
    }
    entry = { key, value: input.create(), dispose: input.dispose, holders: 0 };
    state.entry = entry;
    holders.set(group.name, group);
  }

  const held = entry;
  const free = (): void => {
    state.entry = undefined;
    holders.delete(group.name);
  };
  held.holders += 1;
  let value: Value;
  try {
    // Typed by the token: only this token's `create` fills its slot.
    value = await held.value;
  } catch (error) {
    held.holders -= 1;
    // A failed creation clears the guard so the next holder retries.
    if (state.entry === held) {
      free();
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
      if (held.holders === 0 && state.entry === held) {
        free();
        held.dispose?.(value);
      }
    },
  };
};

/**
 * The realm's resources, shared by every kernel worker the runtime hosts in this realm.
 *
 * Instances live on their group tokens; a directory on `globalThis` records which token holds each name, so
 * duplicate runtime copies of one plugin ABI in a realm agree on it.
 * @internal
 */
export const realmResources: RealmResources = { hold };
