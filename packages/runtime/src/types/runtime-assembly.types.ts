import type { PublishedAssemblyDocument } from '#client/runtime-document.types.js';
import type { ContentDigest } from '@taucad/cache-core';
import type { SpatialMatrix } from '@taucad/spatial';
import type { ExportFile, FileExtension } from '@taucad/types';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { KernelIssue, SourceRevision } from '#types/runtime.types.js';

/** One immutable project-rooted payload, pinned by its SHA-256 digest. @public */
export type PublishedPartAsset = Readonly<{
  path: string;
  digest: ContentDigest;
  byteLength: number;
}>;

/** Request-scoped placement of one admitted canonical component, without changing its immutable root. @public */
export type PublishedAssemblyComponentPlacement = Readonly<{
  componentId: string;
  /** Column-major Y-up/world metres acting on restored native as-built geometry.
   * Intrinsic source placement is already baked into the native shape and is excluded.
   * Source-frame displacement D with admitted occurrence O gives O*D; scene-frame delta E gives E*O.
   * Only finite, affine, rigid, orientation-preserving placements qualify for the installed exact route.
   */
  worldTransform: SpatialMatrix;
}>;

/** Optional native evidence for one effective geometry recipe, not a restore guarantee. @public */
export type PublishedPartExact = Readonly<{
  asset: PublishedPartAsset;
  /** Registration selected for the original producer, independent of its source extension. */
  kernelId: string;
  provider: string;
  providerVersion: string;
  codec: string;
  codecVersion: string;
  unit: 'millimeter' | 'meter';
  linearToleranceMm: number;
  angularToleranceRad: number;
}>;

/** One effective display recipe; variants may have different exact geometry. @public */
export type PublishedPartVariant = Readonly<{
  source: SourceRevision;
  glb: PublishedPartAsset;
  exact?: PublishedPartExact;
}>;

/** Durable completed-part record. All paths are relative to the authorized project root. @public */
export type PublishedPartRecord = Readonly<{
  schemaVersion: 1;
  variants: Readonly<Record<string, PublishedPartVariant>>;
}>;

/** Host-issued, digest-pinned reference to a durable completed-part record. @public */
export type PublishedPartReference = Readonly<{
  path: string;
  digest: ContentDigest;
}>;

/** Serializable worker receipt; the client adds any local asset reader after RPC. @internal */
export type PreparedPublishedPart = Readonly<{
  reference: PublishedPartReference;
  record: PublishedPartRecord;
}>;

/** Internal checked root of pinned parts and admitted occurrences. @internal */
export type PublishedPartsRoot = Readonly<{
  schemaVersion: 1;
  generation: number;
  parts: Readonly<Record<string, PublishedPartReference>>;
  occurrences: readonly PublishedPartOccurrence[];
}>;

/** Verified publication projection carried by a serializable host receipt. @public */
export type PublishedAssembly = Readonly<{
  schemaVersion: 1;
  parts: Readonly<Record<string, PublishedPartRecord>>;
  occurrences: readonly PublishedPartOccurrence[];
}>;

/** Persisted JSON-safe source under this client's rooted project authority. @public */
export type AuthoredAssemblySource =
  | Readonly<{ path: string; files?: never; entry?: never }>
  | Readonly<{ files: Readonly<Record<string, string>>; entry?: string; path?: never }>;

/** Authored source recipe or previously issued pinned part; never caller bytes. @public */
export type AuthoredPartRecipe =
  | Readonly<{
      source: AuthoredAssemblySource;
      variants?: Readonly<Record<string, Readonly<{ source: AuthoredAssemblySource }>>>;
      publishedPart?: never;
    }>
  | Readonly<{ publishedPart: PublishedPartReference; source?: never; variants?: never }>;

/** Authored occurrence tree read from an authorized project file. @public */
export type AuthoredPartOccurrence = Readonly<{ id: string; transform: readonly number[] }> &
  (
    | Readonly<{ children: readonly AuthoredPartOccurrence[]; part?: never; variant?: never }>
    | Readonly<{ part: string; variant?: string; children?: never }>
  );

/** Published leaf variant is explicit even when the author selected default. @public */
export type PublishedPartOccurrence = Readonly<{ id: string; transform: readonly number[] }> &
  (
    | Readonly<{ children: readonly PublishedPartOccurrence[]; part?: never; variant?: never }>
    | Readonly<{ part: string; variant: string; children?: never }>
  );

/** Trusted host-local display admission before any public root commit. @public */
export type AssemblyDisplayProjector = (
  input: Readonly<{
    /** Admission validates the closure; projection materializes its flattened display. */
    purpose?: 'admission' | 'projection';
    records: Readonly<Record<string, PublishedPartRecord>>;
    occurrences: readonly PublishedPartOccurrence[];
    readAsset: (part: string, asset: PublishedPartAsset) => Promise<Uint8Array<ArrayBuffer>>;
  }>,
) => Promise<void | Uint8Array<ArrayBuffer>>;

/** Versioned authored graph, read from the rooted project filesystem. @public */
export type AuthoredAssembly = Readonly<{
  schemaVersion: 1;
  parts: Readonly<Record<string, AuthoredPartRecipe>>;
  occurrences: readonly AuthoredPartOccurrence[];
}>;

/** One injectively encoded occurrence path and its parent. @internal */
export type PublishedOccurrenceIdentity = Readonly<{
  id: string;
  path: readonly string[];
  parent: string | undefined;
  part: string | undefined;
  variant: string | undefined;
  worldTransform: readonly number[];
}>;

/** Serializable result of the checked part-root transition. @internal */
export type PublishedPartsRootOutcome =
  | Readonly<{ status: 'published'; root: PublishedPartAsset; generation: number }>
  | Readonly<{ status: 'superseded' }>;

/** Fresh rooted read of the current publication; it cannot identify a lost caller receipt. @public */
export type PublishedAssemblyRootSnapshot =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'present'; root: PublishedPartAsset; generation: number }>;

/** Serializable admission of one immutable root and its required display closure. @internal */
export type PublishedAssemblyAdmission = Readonly<{
  publication: PublishedAssembly;
  partRecords: Readonly<Record<string, PublishedPartReference>>;
}>;

/** Internal serializable authored-root receipt; readers stay client-local. @internal */
export type PublishedAuthoredRootReceipt = Readonly<{
  outcome: PublishedPartsRootOutcome | Extract<PublishAssemblyOutcome, { status: 'invalid' }>;
  partRecords?: Readonly<Record<string, PublishedPartReference>>;
  publication?: PublishedAssembly;
}>;

declare const admittedByHost: unique symbol;
/** Client-local reader facade attached after host admission; its token is not on the wire. @public */
export type AdmittedAssembly = Readonly<{
  publication: PublishedAssembly;
  readAsset: (digest: PublishedPartAsset['digest']) => Promise<Uint8Array<ArrayBuffer>>;
  [admittedByHost]: true;
}>;

/** Bound client publication result. Caller errors are returned with recovery guidance. @public */
export type PublishAssemblyOutcome =
  | Readonly<{
      status: 'published';
      root: PublishedPartAsset;
      generation: number;
      partRecords: Readonly<Record<string, PublishedPartReference>>;
      admitted: AdmittedAssembly;
      document: PublishedAssemblyDocument;
    }>
  | Readonly<{ status: 'superseded' | 'cancelled' }>
  | Readonly<{
      status: 'commit-unknown';
      publicationPath: string;
      /** Closed observation of the caught rejection, not a producer cause or proof of commit. Null/null is UNKNOWN. */
      failure:
        | Readonly<{ name: 'OperationAbortedError'; code: 'RUNTIME_OPERATION_ABORTED' }>
        | Readonly<{ name: 'OperationTimeoutError'; code: 'RUNTIME_OPERATION_TIMEOUT' }>
        | Readonly<{ name: 'RuntimeTerminatedError'; code: 'RUNTIME_TERMINATED' }>
        // oxlint-disable-next-line typescript/no-restricted-types -- The accepted public UNKNOWN state requires exact null/null serialization.
        | Readonly<{ name: null; code: null }>;
      /** Re-read the current shared root after an interrupted receipt; another client may already have advanced it. */
      readCurrent: () => Promise<PublishedAssemblyRootSnapshot>;
    }>
  | Readonly<{
      status: 'invalid';
      issues: ReadonlyArray<
        Readonly<{
          code: 'SCENE_REFERENCE_INVALID' | 'SCENE_DISPLAY_INVALID';
          path: string;
          message: string;
          recovery: string;
        }>
      >;
    }>;

/** Exact immutable representation selected for a published export. @public */
export type PublishedExportInput = Readonly<{
  format: FileExtension;
  exportOptions?: Record<string, unknown>;
  content?: RuntimeContentInput;
}> &
  (
    | Readonly<{ publishedPart: { reference: PublishedPartReference; variant?: string }; publishedAssembly?: never }>
    | Readonly<{
        publishedAssembly: { root: PublishedPartAsset; placements?: readonly PublishedAssemblyComponentPlacement[] };
        publishedPart?: never;
      }>
  );
/** Published export outcome after the current declared route admits its files. @public */
export type ExportOutcome = Readonly<
  ({ success: true; exportId: string; files: readonly [ExportFile, ...ExportFile[]] } | { success: false }) & {
    issues: readonly KernelIssue[];
    sourceRevision?: SourceRevision;
  }
>;
