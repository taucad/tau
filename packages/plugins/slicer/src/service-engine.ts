/**
 * Client for the `tau-slicer-service/1` companion.
 *
 * The contract, headers, event stream, range reads and bounds follow the
 * S-L1 spike (`agentic-manufacturing-spike-blueprint`, wave S). The client
 * uploads a binary STL, places one request under a caller-retained id,
 * watches NDJSON events, fetches the artifact by ranges and verifies its
 * digest. Nothing here runs in a browser worker by requirement, but nothing
 * in it needs Node either.
 *
 * @module
 */

import { sha256Hex } from '#hashes.js';
import { writeBinaryStl } from '#glb-mesh.js';
import type { TriangleMesh } from '#glb-mesh.js';
import type { ResolvedSlicerOptions } from '#slicer-options.js';

/** Input to {@link sliceWithService}. @internal */
export type ServiceSliceInput = Readonly<{
  mesh: TriangleMesh;
  options: ResolvedSlicerOptions & Readonly<{ service: Readonly<{ url: string; token: string }> }>;
  signal: AbortSignal;
}>;

/** What the companion returned. @internal */
export type ServiceSliceResult = Readonly<{
  gcode: Uint8Array<ArrayBuffer>;
  /** `sha256:` digest of the artifact bytes, verified against the service's claim. */
  digest: string;
  requestId: string;
  sliceId: string;
  generation: string;
}>;

/** Stable refusal codes raised by {@link sliceWithService}. @internal */
export type ServiceEngineErrorCode =
  | 'SERVICE_UPLOAD_TOO_LARGE'
  | 'SERVICE_REQUEST_REJECTED'
  | 'SERVICE_ADMISSION_UNKNOWN'
  | 'SERVICE_SLICE_FAILED'
  | 'SERVICE_EVENT_STREAM_TOO_LARGE'
  | 'SERVICE_ARTIFACT_INVALID'
  | 'SERVICE_ARTIFACT_DIGEST_MISMATCH';

/** Typed refusal raised by {@link sliceWithService}. @internal */
export class ServiceEngineError extends Error {
  public readonly code: ServiceEngineErrorCode;

  public constructor(code: ServiceEngineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServiceEngineError';
    this.code = code;
  }
}

/** Bounds mirrored from the S-L1 service and gateway. @internal */
export const serviceLimits = Object.freeze({
  uploadBytes: 4 * 1024 * 1024,
  outputBytes: 32 * 1024 * 1024,
  eventStreamBytes: 8 * 1024 * 1024,
  rangeBytes: 1024 * 1024,
  /** Milliseconds. */
  requestDeadline: 15_000,
  /** Milliseconds. */
  eventDeadline: 65_000,
  /** Milliseconds. */
  cancelBudget: 5000,
});

const protocolVersion = '1';

type Snapshot = Readonly<{
  sliceId: string;
  requestId: string;
  generation: string;
  state: string;
  /** Optional chaining below also tolerates the wire's `null`. */
  final?: Readonly<{ artifact?: Readonly<{ size: number; sha256: string; path: string }> }>;
  failure?: unknown;
}>;

const isSnapshot = (value: unknown): value is Snapshot =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'sliceId') === 'string' &&
  typeof Reflect.get(value, 'requestId') === 'string' &&
  typeof Reflect.get(value, 'generation') === 'string' &&
  typeof Reflect.get(value, 'state') === 'string';

/**
 * Slice a mesh through the configured companion service.
 *
 * @internal
 * @param input - Mesh, resolved options including the service endpoint, and cancellation.
 * @returns The verified final G-code and its identity.
 * @throws ServiceEngineError - On any refused, ambiguous or unverifiable outcome; ambiguous admission is never re-placed.
 */
export const sliceWithService = async (input: ServiceSliceInput): Promise<ServiceSliceResult> => {
  const { options, signal } = input;
  const base = options.service.url.replace(/\/+$/u, '');
  const request = async (path: string, init: RequestInit & { deadline?: number } = {}): Promise<Response> => {
    signal.throwIfAborted();
    const { deadline = serviceLimits.requestDeadline, headers, ...rest } = init;
    return fetch(`${base}${path}`, {
      ...rest,
      headers: {
        authorization: `Bearer ${options.service.token}`,
        'tau-slicer-protocol': protocolVersion,
        ...headers,
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(deadline)]),
    });
  };
  const readJson = async (response: Response): Promise<unknown> => {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  };

  const stl = writeBinaryStl(input.mesh);
  if (stl.byteLength > serviceLimits.uploadBytes) {
    throw new ServiceEngineError(
      'SERVICE_UPLOAD_TOO_LARGE',
      `The mesh serialises to ${stl.byteLength} bytes; the service accepts at most ${serviceLimits.uploadBytes}.`,
    );
  }
  const inputDigest = sha256Hex(stl);
  const upload = await request(`/v1/blobs/${inputDigest}`, { method: 'PUT', body: stl });
  if (upload.status !== 200 && upload.status !== 201) {
    throw new ServiceEngineError('SERVICE_REQUEST_REJECTED', `Blob upload returned HTTP ${upload.status}.`);
  }
  await upload.arrayBuffer();

  /* eslint-disable @typescript-eslint/naming-convention -- tau-slicer-service/1 settings field names are fixed. */
  const settings = {
    layer_height: options.layerHeight,
    wall_loops: options.walls,
    bed_width: options.bedSize.x,
    bed_depth: options.bedSize.y,
    fill_density: options.infillPercent / 100,
  };
  /* eslint-enable @typescript-eslint/naming-convention -- settings section ends. */
  const placement = { inputDigest, mode: 'st', settings };
  const requestId = `tau-${sha256Hex(new TextEncoder().encode(JSON.stringify(placement))).slice(0, 40)}`;
  const body = JSON.stringify({ requestId, ...placement });

  let admitted: Snapshot | undefined;
  try {
    const response = await request('/v1/slices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const value = await readJson(response);
    if ((response.status === 200 || response.status === 202) && isSnapshot(value)) {
      admitted = value;
    } else if (response.status < 500) {
      throw new ServiceEngineError(
        'SERVICE_REQUEST_REJECTED',
        `Slice placement returned HTTP ${response.status}${typeof value === 'object' && value !== null && 'code' in value ? ` (${String(Reflect.get(value, 'code'))})` : ''}.`,
      );
    }
  } catch (error) {
    if (error instanceof ServiceEngineError || signal.aborted) {
      throw error;
    }
  }
  if (admitted === undefined) {
    // The reply was lost or the proxy failed: look the request up by its retained id; never place it again.
    const lookup = await request(`/v1/requests/${requestId}`);
    const value = await readJson(lookup);
    if (lookup.status !== 200 || !isSnapshot(value)) {
      throw new ServiceEngineError(
        'SERVICE_ADMISSION_UNKNOWN',
        `Slice placement for request ${requestId} was not acknowledged and the service does not know it (HTTP ${lookup.status}).`,
      );
    }
    admitted = value;
  }
  const { sliceId, generation } = admitted;

  const cancel = async (): Promise<void> => {
    try {
      await fetch(`${base}/v1/slices/${sliceId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${options.service.token}`, 'tau-slicer-protocol': protocolVersion },
        signal: AbortSignal.timeout(serviceLimits.cancelBudget),
      });
    } catch {
      // The abort reason is the caller's outcome; a failed cancel is reported by the service journal, not here.
    }
  };

  try {
    const events = await request(`/v1/slices/${sliceId}/events`, { deadline: serviceLimits.eventDeadline });
    if (events.status !== 200 || events.body === null) {
      throw new ServiceEngineError('SERVICE_SLICE_FAILED', `Event stream returned HTTP ${events.status}.`);
    }
    const reader = events.body.getReader();
    let received = 0;
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another by definition
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      received += chunk.value.byteLength;
      if (received > serviceLimits.eventStreamBytes) {
        // oxlint-disable-next-line no-await-in-loop -- releases the stream before the refusal
        await reader.cancel();
        throw new ServiceEngineError(
          'SERVICE_EVENT_STREAM_TOO_LARGE',
          `Event stream exceeded ${serviceLimits.eventStreamBytes} bytes.`,
        );
      }
    }

    const finalResponse = await request(`/v1/slices/${sliceId}`);
    const finalValue = await readJson(finalResponse);
    if (finalResponse.status !== 200 || !isSnapshot(finalValue)) {
      throw new ServiceEngineError('SERVICE_SLICE_FAILED', `Slice lookup returned HTTP ${finalResponse.status}.`);
    }
    const artifact = finalValue.final?.artifact;
    if (finalValue.state !== 'completed' || artifact === undefined) {
      throw new ServiceEngineError(
        'SERVICE_SLICE_FAILED',
        `Slice ${sliceId} ended in state "${finalValue.state}"${finalValue.failure === undefined || finalValue.failure === null ? '' : ` (${JSON.stringify(finalValue.failure)})`}.`,
      );
    }
    if (
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0 ||
      artifact.size > serviceLimits.outputBytes ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
      !artifact.path.startsWith('/v1/')
    ) {
      throw new ServiceEngineError('SERVICE_ARTIFACT_INVALID', `Slice ${sliceId} reported an unusable artifact.`);
    }

    const gcode = new Uint8Array(artifact.size);
    for (let start = 0; start < artifact.size; start += serviceLimits.rangeBytes) {
      const end = Math.min(start + serviceLimits.rangeBytes, artifact.size) - 1;
      // oxlint-disable-next-line no-await-in-loop -- ranges are read in order so only one is held at a time
      const range = await request(artifact.path, { headers: { range: `bytes=${start}-${end}` } });
      // oxlint-disable-next-line no-await-in-loop -- see above
      const bytes = new Uint8Array(await range.arrayBuffer());
      if (range.status !== 206 || bytes.byteLength !== end - start + 1) {
        throw new ServiceEngineError(
          'SERVICE_ARTIFACT_INVALID',
          `Range ${start}-${end} returned HTTP ${range.status} with ${bytes.byteLength} bytes.`,
        );
      }
      gcode.set(bytes, start);
    }
    const digest = sha256Hex(gcode);
    if (digest !== artifact.sha256) {
      throw new ServiceEngineError(
        'SERVICE_ARTIFACT_DIGEST_MISMATCH',
        `Artifact digest ${digest} does not match the service's ${artifact.sha256}.`,
      );
    }
    return { gcode, digest: `sha256:${digest}`, requestId, sliceId, generation };
  } catch (error) {
    if (signal.aborted) {
      await cancel();
    }
    throw error;
  }
};
