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
  ingestSubject(request: HostBytes, primary: HostBytes, resources: readonly HostBytes[]): HostBytes;
  ingestMesh(request: HostBytes, mesh: HostBytes): HostBytes;
  processRequest(request: HostBytes): HostBytes;
  canonicalPlan(request: HostBytes): HostBytes;
  evaluatePlan(plan: HostBytes): HostBytes;
};

/** Node lifecycle operations over opaque core control bytes. @public */
export type HostSubjectLifecycle = {
  subjectHandle(request: HostBytes): HostBytes;
  releaseSubject(request: HostBytes): HostBytes;
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
