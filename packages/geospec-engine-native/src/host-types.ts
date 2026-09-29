/** Bytes accepted and returned by a GeoSpec host facade. @public */
export type HostBytes = Uint8Array<ArrayBuffer>;

/** Stable protocol failure surfaced by every GeoSpec host facade. @public */
export class ProtocolError extends Error {
  /** Machine-readable core error code. */
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

/** Byte-only stateful engine surface shared by Node and WASM hosts. @public */
export type HostEngine = {
  /** Non-mutating cumulative diagnostics; absent on unqualified historical bindings. */
  observations?: () => HostBytes;
  close(): void;
  ingestSubject(request: HostBytes, primary: HostBytes, resources: readonly HostBytes[]): HostBytes;
  ingestMesh(request: HostBytes, mesh: HostBytes): HostBytes;
  processRequest(request: HostBytes): HostBytes;
  canonicalPlan(request: HostBytes): HostBytes;
  evaluatePlan(plan: HostBytes): HostBytes;
  evaluateClaim(request: HostBytes): HostClaimEvaluation;
};

/**
 * Exact canonical bytes of one claim evaluated in one engine call: the bytes `canonicalPlan`,
 * `canonicalize` of that plan's claim and `evaluatePlan` of that plan return. @public
 */
export type HostClaimEvaluation = {
  readonly canonicalPlan: HostBytes;
  readonly canonicalClaim: HostBytes;
  readonly canonicalResult: HostBytes;
};

/** Node lifecycle operations over opaque core control bytes. @public */
export type HostSubjectLifecycle = {
  subjectHandle(request: HostBytes): HostBytes;
  releaseSubject(request: HostBytes): HostBytes;
};

/** Explicit Node filesystem cache construction options. @public */
export type HostCacheOptions = {
  readonly root: string;
  readonly projectRoot: string;
};

/** Optional authenticated overlap-cache lifecycle. @public */
export type HostCacheLifecycle = {
  flushCache(): HostBytes;
  clearOverlapCache(): boolean;
  cacheProducerIdentity(): HostBytes;
};

type ErrorLike = {
  readonly code?: unknown;
  readonly message?: unknown;
};

const isErrorLike = (value: unknown): value is ErrorLike => typeof value === 'object' && value !== null;

/**
 * Convert a binding failure into the shared host error.
 *
 * @internal
 * @param error - Value thrown by the generated binding.
 * @returns The normalized protocol error.
 */
export const asProtocolError = (error: unknown): ProtocolError => {
  if (error instanceof ProtocolError) {
    return error;
  }
  if (isErrorLike(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ProtocolError(error.code, error.message, { cause: error });
  }
  throw error;
};

/**
 * Copy binding output into a fresh ordinary ArrayBuffer-backed view.
 *
 * @internal
 * @param value - Value returned by a generated binding.
 * @returns Fresh host-owned bytes.
 */
export const toHostBytes = (value: unknown): HostBytes => {
  if (!(value instanceof Uint8Array)) {
    throw new ProtocolError('invalid-request', 'Host binding returned a non-byte value.');
  }
  return Uint8Array.from(value);
};

/**
 * Split one `evaluateClaim` frame into views over its single host copy. The core frame is
 * `u32le planLength, u32le claimLength, plan, claim, result`.
 *
 * @internal
 * @param frame - Fresh host-owned frame bytes.
 * @returns Canonical plan, claim and result views sharing the frame's buffer.
 */
export const toHostClaimEvaluation = (frame: HostBytes): HostClaimEvaluation => {
  const header = 8;
  if (frame.byteLength >= header) {
    const lengths = new DataView(frame.buffer, frame.byteOffset, header);
    const claimStart = header + lengths.getUint32(0, true);
    const resultStart = claimStart + lengths.getUint32(4, true);
    if (resultStart <= frame.byteLength) {
      return {
        canonicalPlan: frame.subarray(header, claimStart),
        canonicalClaim: frame.subarray(claimStart, resultStart),
        canonicalResult: frame.subarray(resultStart),
      };
    }
  }
  throw new ProtocolError('invalid-request', 'Host binding returned a malformed claim evaluation.');
};

/**
 * Invoke one synchronous host operation through the shared error boundary.
 *
 * @internal
 * @param operation - Binding operation to invoke.
 * @returns The exact bytes returned by the binding.
 */
export const callHost = (operation: () => HostBytes): HostBytes => {
  try {
    return operation();
  } catch (error) {
    throw asProtocolError(error);
  }
};

/** Actual engine-method copies owned by a host facade. Diagnostic traffic is excluded. @internal */
export type HostCopyObservations = {
  exact: boolean;
  inputCopies: bigint;
  inputBytes: bigint;
  outputCopies: bigint;
  outputBytes: bigint;
};

/**
 * Observe an actual copy in fixed-width counters without affecting engine work.
 * @internal
 * @param copies - Engine facade counters.
 * @param direction - Boundary direction.
 * @param bytes - Actual nonempty copied length.
 */
export const observeHostCopy = (copies: HostCopyObservations, direction: 'input' | 'output', bytes: number): void => {
  if (bytes === 0) {
    return;
  }
  const countKey = direction === 'input' ? 'inputCopies' : 'outputCopies';
  const bytesKey = direction === 'input' ? 'inputBytes' : 'outputBytes';
  const total = copies[bytesKey] + BigInt(bytes);
  const maximum = 18_446_744_073_709_551_615n;
  if (copies[countKey] === maximum || total > maximum) {
    copies.exact = false;
    return;
  }
  copies[countKey] += 1n;
  copies[bytesKey] = total;
};

/**
 * Join actual facade copies with the owned engine snapshot without mutating either.
 * @param bytes - Engine observation bytes, not geometry result bytes.
 * @param copies - Actual facade copy counters.
 * @returns Owned diagnostic bytes with exact decimal-string integers.
 * @internal
 */
export const appendHostObservationCopies = (bytes: HostBytes, copies: HostCopyObservations): HostBytes => {
  const snapshot = JSON.parse(new TextDecoder().decode(bytes)) as {
    schema: string;
    exact: boolean;
    copies: Record<Exclude<keyof HostCopyObservations, 'exact'>, string>;
  };
  if (snapshot.schema !== 'geospec-engine-observations-v1') {
    throw new Error('Unsupported engine observation schema.');
  }
  snapshot.exact = snapshot.exact && copies.exact;
  for (const key of ['inputCopies', 'inputBytes', 'outputCopies', 'outputBytes'] as const) {
    snapshot.copies[key] = (BigInt(snapshot.copies[key]) + copies[key]).toString();
  }
  return new TextEncoder().encode(JSON.stringify(snapshot));
};
