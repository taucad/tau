/** A recursively immutable value with one unambiguous canonical JSON representation. @public */
export type CacheValue =
  // oxlint-disable-next-line typescript/no-restricted-types -- canonical JSON has an explicit null value
  null | boolean | number | string | readonly CacheValue[] | Readonly<{ [key: string]: CacheValue }>;

declare const contentDigestBrand: unique symbol;
declare const actionDigestBrand: unique symbol;
declare const sceneDigestBrand: unique symbol;

/** A validated lowercase SHA-256 identity for immutable bytes. @public */
export type ContentDigest = `sha256:${string}` & { readonly [contentDigestBrand]: true };

/** A validated lowercase SHA-256 identity for a canonical compute action. @public */
export type ActionDigest = `sha256:${string}` & { readonly [actionDigestBrand]: true };

/** A validated lowercase SHA-256 identity for a canonical scene value. @public */
export type SceneDigest = `sha256:${string}` & { readonly [sceneDigestBrand]: true };

/** Versioned serializer for one reusable compute result type. @public */
export type CacheCodec<T> = {
  readonly id: string;
  readonly version: string;
  readonly mediaType: string;
  readonly encode: (input: {
    readonly value: T;
    readonly signal: AbortSignal;
  }) => Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
  readonly decode: (input: { readonly bytes: Uint8Array<ArrayBuffer>; readonly signal: AbortSignal }) => Promise<T> | T;
};

/** Stable identity inputs for a cacheable unit of kernel or solver work. @public */
export type ComputeActionInput =
  | { readonly kind: 'content'; readonly role: string; readonly digest: ContentDigest }
  | { readonly kind: 'action'; readonly role: string; readonly digest: ActionDigest }
  | { readonly kind: 'scene'; readonly role: string; readonly digest: SceneDigest };

/** Stable identity inputs for a cacheable unit of kernel or solver work. @public */
export type ComputeAction = {
  readonly schemaVersion: 1;
  readonly namespace: string;
  readonly producer: {
    readonly id: string;
    readonly version: string;
    readonly implementationAssets: readonly ContentDigest[];
  };
  readonly operation: string;
  readonly inputs: readonly ComputeActionInput[];
  readonly arguments: CacheValue;
  readonly environment: CacheValue;
  readonly codec: {
    readonly id: string;
    readonly version: string;
  };
};

/** Cache failure behavior for one evaluation. @public */
export type CachePolicy = 'best-effort' | 'required';

/** Inputs for one content-addressed compute evaluation. @public */
export type ComputeEvaluationInput<T> = {
  readonly action: ComputeAction;
  readonly codec: CacheCodec<T>;
  readonly policy: CachePolicy;
  readonly compute: (input: { readonly signal: AbortSignal }) => Promise<T>;
  readonly signal?: AbortSignal;
};

/** Result of a cache lookup or newly completed computation. @public */
export type ComputeEvaluationResult<T> =
  | {
      readonly source: 'cache';
      readonly value: T;
      readonly actionDigest: ActionDigest;
      readonly contentDigest: ContentDigest;
    }
  | {
      readonly source: 'computed';
      readonly value: T;
      readonly actionDigest: ActionDigest;
      readonly publication:
        | { readonly status: 'stored'; readonly contentDigest: ContentDigest }
        | {
            readonly status: 'skipped';
            readonly reason: 'encode-failed' | 'content-store-failed' | 'action-store-failed';
          };
    };

/** Coordinates lookup, compute, serialization, and transactional cache publication. @public */
export type ComputeReuseService = {
  readonly evaluate: <T>(input: ComputeEvaluationInput<T>) => Promise<ComputeEvaluationResult<T>>;
};
