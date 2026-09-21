import type { FileParameterEntry, JSONValue } from '@taucad/types';

/** Serializable identity of one persisted parameter authority target. @public */
export type ParameterSetTarget = Readonly<{
  authority: string;
  root: string;
  checkout?: string;
  entry: string;
}>;

/**
 * The admitted manifest a parameter operation was built from. A source change produces a new
 * manifest revision, so this one token covers every semantic input; it is never persisted, and
 * value-level concurrency is proved by the sidecar's own bytes plus the request's {@link
 * ParameterSetRequestBase}. @public
 */
export type ParameterSetIdentity = Readonly<{ manifestRevision: string }>;

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

/**
 * Supported headless parameter operation intents. A field is named by `group` plus `pointer` under
 * the manifest revision the request declares; nothing else identifies it. @public
 */
export type ParameterSetOperation =
  | Readonly<{
      kind: 'native-value';
      group: string;
      pointer: string;
      value: JSONValue;
    }>
  | Readonly<{
      kind: 'unit-value';
      group: string;
      pointer: string;
      inputUnit: string;
      value: string;
    }>
  | Readonly<{
      kind: 'batch';
      group: string;
      edits: ReadonlyArray<
        Readonly<{
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
      kind: 'source-unit';
      mode: 'preserve-size';
      group: string;
      pointer: string;
      unit: string;
      /** The producer and revision sanctioning the rebind; it pins the producer, not the field. */
      producerCapability: ParameterSourceUnitCapability;
    }>;

/**
 * Field-scoped freshness evidence for one draft: the value and effective binding the editor was
 * working from. It is the whole value-level conflict rule: an edit commits while its own field
 * still holds `base.value`, no matter what other fields changed meanwhile. @public
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
  /** Caller correlation label; it never reaches the record. */
  fingerprint?: string;
  /** The manifest this request was built from; the planner refuses it once the live one differs. */
  expected: ParameterSetIdentity;
  /**
   * When present, a value edit commits only while its own field still holds `base.value` under an
   * unchanged effective binding. Without it a value edit overwrites whatever the field now holds.
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
    }>
  | Readonly<{ status: 'rejected'; code: string; message: string }>;

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
