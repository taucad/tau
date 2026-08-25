/**
 * Shape returned by KCL WASM `Context.execute` after kcl-lib frontend integration.
 * Rust serializes `SceneGraphDelta` with snake_case field names (no `rename_all` on the struct).
 *
 * @public
 */
export type KclSceneGraphDelta = {
  /** Scene graph payload for future picking/selection consumers (opaque at this boundary). */
  newGraph: unknown;
  /** New scene object ids from execution. */
  newObjects: unknown[];
  /** Whether dependents must invalidate cached ids. */
  invalidatesIds: boolean;
  /** Nested execution outcome (camelCase per `ExecOutcome`'s serde rename). */
  execOutcome: unknown;
};

/**
 * Normalizes WASM JSON for `execute` (SceneGraphDelta) or legacy flat `ExecOutcome` returns.
 *
 * @param raw - Value from `Context.execute` or a plain exec outcome object.
 * @returns Typed delta; use `execOutcome` with {@link normalizeKclExecutionResult} in kcl-utils.
 * @public
 */
export function normalizeSceneGraphDelta(raw: unknown): KclSceneGraphDelta {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError(`normalizeSceneGraphDelta: expected object, got ${String(raw)}`);
  }

  const record = raw as Record<string, unknown>;

  if ('exec_outcome' in record && typeof record['exec_outcome'] === 'object' && record['exec_outcome'] !== null) {
    return {
      newGraph: record['new_graph'],
      newObjects: Array.isArray(record['new_objects']) ? record['new_objects'] : [],
      invalidatesIds: Boolean(record['invalidates_ids']),
      execOutcome: record['exec_outcome'],
    };
  }

  if (
    'variables' in record ||
    'issues' in record ||
    'errors' in record ||
    'operations' in record ||
    'artifactGraph' in record
  ) {
    return {
      newGraph: undefined,
      newObjects: [],
      invalidatesIds: false,
      execOutcome: raw,
    };
  }

  throw new TypeError('normalizeSceneGraphDelta: unrecognized execute payload shape');
}
