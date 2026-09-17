import type { FileParameterEntry, JSONValue } from '@taucad/types';

/** Serializable identity of one persisted parameter authority target. @public */
export type ParameterSetTarget = Readonly<{
  authority: string;
  root: string;
  checkout?: string;
  entry: string;
}>;

/** Revisions covering every semantic input to a parameter operation. @public */
export type ParameterSetIdentity = Readonly<{
  sourceRevision: string;
  manifestRevision: string;
  valueRevision: string;
  dependencyRevision: string;
}>;

/** Current durable parameter record and its checked authority identity. @public */
export type ParameterSetAuthoritySnapshot = Readonly<{
  entry: FileParameterEntry;
  identity: ParameterSetIdentity;
}>;

/** One declaration-owner capability required for a source-unit transaction. @public */
export type ParameterSourceUnitCapability = Readonly<{
  producer: string;
  sourceRevision: string;
  capability: string;
}>;

/** Supported headless parameter operation intents. @public */
export type ParameterSetOperation =
  | Readonly<{
      kind: 'native-value';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      value: JSONValue;
    }>
  | Readonly<{
      kind: 'unit-value';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      inputUnit: string;
      value: string;
    }>
  | Readonly<{
      kind: 'batch';
      group: string;
      edits: ReadonlyArray<
        Readonly<{
          parameterId: string;
          resource: string;
          pointer: string;
          value: JSONValue;
          inputUnit?: string;
        }>
      >;
    }>
  | Readonly<{ kind: 'reset-group'; group: string }>
  | Readonly<{
      kind: 'replace-group-values';
      group: string;
      values: Readonly<Record<string, JSONValue>>;
    }>
  | Readonly<{
      kind: 'create-group';
      group: string;
      values?: Readonly<Record<string, JSONValue>>;
    }>
  | Readonly<{ kind: 'delete-group'; group: string }>
  | Readonly<{ kind: 'select-group'; group: string }>
  | Readonly<{ kind: 'rename-group'; group: string; nextGroup: string }>
  | Readonly<{
      kind: 'confirm-inference';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
    }>
  | Readonly<{
      kind: 'bind-parameter';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      binding: Readonly<{
        unit?: string;
        quantityKind?: string;
        space?: 'linear' | 'difference' | 'point';
        reference?: string;
      }>;
    }>
  | Readonly<{
      kind: 'source-unit';
      mode: 'preserve-size' | 'reinterpret';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      unit: string;
      producerCapability: ParameterSourceUnitCapability;
      /**
       * Optional source-file digests the caller observed, keyed like `manifest.identity.sourceFiles`.
       * Each named file must match the admitted manifest; the confirmation always echoes the
       * manifest's own source snapshot.
       */
      dependencies?: Readonly<Record<string, string>>;
    }>
  | Readonly<{ kind: 'display-preference'; parameterId: string; unit: string }>;

/**
 * Field-scoped freshness evidence for one draft: the value and effective binding the editor was
 * working from. It lets the planner accept a request whose whole-record revision moved only
 * because a different field changed. @public
 */
export type ParameterSetRequestBase = Readonly<{
  pointer: string;
  value: JSONValue;
  binding?: Readonly<{
    unit?: string;
    quantityKind?: string;
    space?: 'linear' | 'difference' | 'point';
    reference?: string;
    representation?: 'binary64' | 'safe-integer' | 'decimal';
  }>;
}>;

/** Correlated request accepted by the parameter-set owner. @public */
export type ParameterSetRequest = Readonly<{
  requestId: string;
  draftGeneration: number;
  /**
   * Caller correlation label. The planner always derives the authoritative operation fingerprint
   * from the target, expectation and operation, so this value never reaches the record.
   */
  fingerprint?: string;
  expected: ParameterSetIdentity;
  /**
   * When present and only `valueRevision` has moved, the planner rebases `expected` onto the
   * current identity provided this field still holds `base.value` under an unchanged effective
   * binding. Without it the strict whole-record rule applies.
   */
  base?: ParameterSetRequestBase;
  pressure: 'transient' | 'final';
  operation: ParameterSetOperation;
}>;

/** Result returned by the named planning effect. @public */
export type ParameterSetPlanResult =
  | Readonly<{ status: 'ready'; proposed: ParameterSetAuthoritySnapshot }>
  | Readonly<{
      status: 'confirmation-required';
      proposed: ParameterSetAuthoritySnapshot;
      planFingerprint: string;
      producerCapability: ParameterSourceUnitCapability;
      dependencies: Readonly<Record<string, string>>;
    }>
  | Readonly<{ status: 'rejected'; code: string; message: string }>;

/** Result returned by the named checked-apply effect. @public */
export type ParameterSetApplyResult =
  | Readonly<{
      status: 'applied' | 'unchanged';
      current: ParameterSetAuthoritySnapshot;
    }>
  | Readonly<{
      status: 'conflict';
      code: 'STALE_MANIFEST';
      current: ParameterSetAuthoritySnapshot;
      conflicts: readonly string[];
    }>;

/** Stable public settlement vocabulary for every submitted request. @public */
export type ParameterSetOutcome =
  | Readonly<{
      status: 'committed';
      requestId: string;
      revision: ParameterSetIdentity;
      write: 'applied' | 'authority-no-op' | 'durable-no-op' | 'reconciled';
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      code: string;
      message: string;
    }>
  | Readonly<{ status: 'cancelled-before-apply'; requestId: string }>
  | Readonly<{
      status: 'known-not-applied-failure';
      requestId: string;
      code: string;
      message: string;
    }>
  | Readonly<{
      status: 'indeterminate';
      requestId: string;
      code: string;
      message: string;
    }>;
