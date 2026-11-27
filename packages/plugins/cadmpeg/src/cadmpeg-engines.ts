import { sha256Bytes } from '@taucad/runtime/kernel';
import type { KernelIssue, KernelIssueCode } from '@taucad/runtime/types';
import { z } from 'zod';

/**
 * Where a browser host serves the cadmpeg engines (charter D2, D9). Data only: the installed
 * `cadmpeg-ts` states what each engine is (`cadmpeg-ts/digests`), so the host states only where.
 *
 * - `digest`: `${baseUrl}blobs/sha256/<gzip sha256>`, the dependency hosts' write-once layout. The
 *   gzip bytes are verified, decompressed, and verified again as WebAssembly.
 * - `package`: `${baseUrl}<module>_bg.wasm`, the installed package's `dist/wasm` served same-origin
 *   (`tau serve`, development).
 *
 * `baseUrl` ends with `/`; a relative value resolves against the page.
 */
export const cadmpegEnginesSchema = z.strictObject({
  baseUrl: z
    .string()
    .min(1)
    .refine((value) => value.endsWith('/'), { message: 'baseUrl must end with "/"' }),
  layout: z.enum(['digest', 'package']),
});

/** Engine delivery for a browser realm. @public */
export type CadmpegEngines = z.input<typeof cadmpegEnginesSchema>;

/**
 * Kernel and transcoder options. `engines` is where a browser host serves the engines; Node.js
 * hosts (desktop, the CLI) load the native addon and ignore it.
 */
export const cadmpegOptionsSchema = z.strictObject({
  engines: cadmpegEnginesSchema.optional(),
});

/** Registration options of the cadmpeg kernel and transcoder. @public */
export type CadmpegOptions = z.input<typeof cadmpegOptionsSchema>;

/** The SHA-256 (lowercase hex) and byte length of one file, as `cadmpeg-ts/digests` states them. */
type FileDigest = { readonly sha256: string; readonly byteLength: number };

/** The shape of `cadmpeg-ts/digests`: one entry per module id. */
export type EngineDigests = Readonly<Record<string, { readonly wasm: FileDigest; readonly gzip: FileDigest }>>;

/**
 * Why an engine was refused. `unreachable`: no response (offline, DNS, CORS, a reset body).
 * `status`: a response that is not 200. `redirect`: the host redirected (never followed).
 * `integrity`: the bytes are not the ones `cadmpeg-ts/digests` names (`check` says which test failed).
 *
 * @public
 */
export type CadmpegEngineFailure = 'unreachable' | 'status' | 'redirect' | 'integrity';

/** Which integrity test refused the bytes. @public */
export type CadmpegEngineIntegrityCheck = 'byteLength' | 'sha256' | 'gunzip';

/**
 * The `details` of an engine delivery issue. `format` is the cadmpeg module id (`sldprt`, `step`, …)
 * and `host` the engine host's `host`.
 *
 * @public
 */
export type CadmpegEngineIssueDetails = {
  readonly producer: 'cadmpeg';
  readonly engineFailure: CadmpegEngineFailure;
  readonly format: string;
  readonly host: string;
  readonly url: string;
  readonly status?: number;
  readonly check?: CadmpegEngineIntegrityCheck;
  readonly file?: 'gzip' | 'wasm';
};

type FailureFacts = Omit<CadmpegEngineIssueDetails, 'producer' | 'format' | 'host' | 'url'>;

/** The engine a request is for, and where it was asked. */
type EngineRequest = { readonly format: string; readonly url: URL };

const describeFailure = (facts: FailureFacts): string => {
  switch (facts.engineFailure) {
    case 'unreachable': {
      return 'the host could not be reached';
    }
    case 'status': {
      return `the host answered HTTP ${facts.status}`;
    }
    case 'redirect': {
      return 'the host redirected, and engines are never fetched through a redirect';
    }
    case 'integrity': {
      return `the ${facts.file ?? 'engine'} bytes failed the ${facts.check ?? 'integrity'} check against cadmpeg-ts/digests`;
    }
  }
};

/**
 * A refused engine delivery, or an unprepared host. Carries its runtime issue on `.issues`, which
 * the runtime reports verbatim (`carriedKernelIssues`).
 *
 * @internal
 */
export class CadmpegEngineError extends Error {
  public readonly issues: [KernelIssue];

  public constructor(issue: KernelIssue, options?: ErrorOptions) {
    super(issue.message, options);
    this.issues = [issue];
    this.name = 'CadmpegEngineError';
  }
}

/**
 * The refusal a browser realm gives when the host supplied no engine delivery (charter D9).
 *
 * @param reason - What is missing or wrong.
 * @param options - The underlying cause, if any.
 * @returns The error to throw or report.
 */
export const enginesNotPrepared = (reason: string, options?: ErrorOptions): CadmpegEngineError =>
  new CadmpegEngineError(
    {
      code: 'KERNEL_NOT_PREPARED',
      type: 'kernel',
      severity: 'error',
      message: `cadmpeg engines are not prepared: ${reason}`,
      details: { producer: 'cadmpeg', environment: 'browser' },
    },
    options,
  );

const deliveryError = (where: EngineRequest, facts: FailureFacts, cause?: unknown): CadmpegEngineError => {
  const details: CadmpegEngineIssueDetails = {
    producer: 'cadmpeg',
    format: where.format,
    host: where.url.host,
    url: where.url.href,
    ...facts,
  };
  return new CadmpegEngineError(
    {
      // Rewritten per role by `engineIssue`; the kernel's code is the default.
      code: 'KERNEL_BINDING_FAILED',
      type: 'kernel',
      severity: 'error',
      message: `cadmpeg could not load the ${where.format} engine from ${where.url.host}: ${describeFailure(facts)}.`,
      details,
    },
    cause === undefined ? undefined : { cause },
  );
};

/**
 * Resolve and admit a host's engine base URL: http or https, no credentials, query or fragment.
 *
 * @param baseUrl - The option's value, absolute or relative to the page.
 * @returns The absolute base.
 */
export const resolveEngineBase = (baseUrl: string): URL => {
  let url: URL;
  try {
    // A worker has `location`; a Node.js test realm does not.
    url = new URL(baseUrl, 'location' in globalThis ? globalThis.location.href : undefined);
  } catch (error) {
    throw enginesNotPrepared(`engines.baseUrl ${JSON.stringify(baseUrl)} is not a URL`, { cause: error });
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/')
  ) {
    throw enginesNotPrepared(
      `engines.baseUrl ${JSON.stringify(baseUrl)} must be an http(s) directory URL without credentials, query or fragment`,
    );
  }
  return url;
};

/**
 * Whether a rejected fetch was a refused redirect. Under `redirect: 'error'` undici names it in the
 * rejection's cause; browsers give a bare `TypeError`, which reads as unreachable.
 *
 * @param error - What `fetch` rejected with.
 * @returns `true` when the rejection names a redirect.
 */
const isRedirectRejection = (error: unknown): boolean => {
  for (let current = error, depth = 0; current instanceof Error && depth < 4; current = current.cause, depth += 1) {
    if (/redirect/iu.test(current.message)) {
      return true;
    }
  }
  return false;
};

const fetchBytes = async (where: EngineRequest): Promise<Uint8Array<ArrayBuffer>> => {
  let response: Response;
  try {
    response = await fetch(where.url.href, { redirect: 'error' });
  } catch (error) {
    throw deliveryError(where, { engineFailure: isRedirectRejection(error) ? 'redirect' : 'unreachable' }, error);
  }
  // `redirect: 'error'` never yields one of these from a conforming fetch; refuse them all the same.
  if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw deliveryError(where, { engineFailure: 'redirect', status: response.status });
  }
  if (response.status !== 200) {
    throw deliveryError(where, { engineFailure: 'status', status: response.status });
  }
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw deliveryError(where, { engineFailure: 'unreachable' }, error);
  }
};

const verify = async (
  bytes: Uint8Array<ArrayBuffer>,
  expected: FileDigest & { readonly file: 'gzip' | 'wasm' },
  where: EngineRequest,
): Promise<void> => {
  const { file } = expected;
  if (bytes.byteLength !== expected.byteLength) {
    throw deliveryError(where, { engineFailure: 'integrity', check: 'byteLength', file });
  }
  if ((await sha256Bytes(bytes)) !== expected.sha256.toLowerCase()) {
    throw deliveryError(where, { engineFailure: 'integrity', check: 'sha256', file });
  }
};

const gunzip = async (bytes: Uint8Array<ArrayBuffer>, where: EngineRequest): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    throw deliveryError(where, { engineFailure: 'integrity', check: 'gunzip', file: 'gzip' }, error);
  }
};

/**
 * Build the `locateModule` callback `cadmpeg-ts/core` takes: fetch one engine, verify every byte
 * against the installed digest map, and hand cadmpeg-ts a `Response` it can stream-compile.
 *
 * Nothing is cached here: a refused load rejects, `cadmpeg-ts` drops the rejected module, and the
 * next conversion fetches again, so a retry needs no reload (I10). A loaded module stays in
 * `cadmpeg-ts`'s per-worker cache; repeat fetches are answered by the HTTP cache (D18).
 *
 * @param options - Where the engines are served and what they must be.
 * @returns A `locateModule` for `createCadmpeg`, resolving each module id to a verified `Response`.
 */
export const createEngineLocator = (options: {
  readonly engines: z.output<typeof cadmpegEnginesSchema>;
  readonly digests: EngineDigests;
}): ((id: string) => Promise<Response>) => {
  const base = resolveEngineBase(options.engines.baseUrl);
  const { layout } = options.engines;
  return async (id) => {
    const digest = Object.hasOwn(options.digests, id) ? options.digests[id] : undefined;
    if (digest === undefined) {
      throw enginesNotPrepared(`cadmpeg-ts/digests names no ${id} engine`);
    }
    let wasm: Uint8Array<ArrayBuffer>;
    if (layout === 'digest') {
      const where = { format: id, url: new URL(`blobs/sha256/${digest.gzip.sha256}`, base) };
      const gzip = await fetchBytes(where);
      await verify(gzip, { ...digest.gzip, file: 'gzip' }, where);
      wasm = await gunzip(gzip, where);
      await verify(wasm, { ...digest.wasm, file: 'wasm' }, where);
    } else {
      const where = { format: id, url: new URL(`${id}_bg.wasm`, base) };
      wasm = await fetchBytes(where);
      await verify(wasm, { ...digest.wasm, file: 'wasm' }, where);
    }
    return new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } });
  };
};

/**
 * Find a refused engine delivery in a thrown value's cause chain (`cadmpeg-ts` wraps a failed
 * locator in `CadmpegError('BACKEND_UNAVAILABLE')`), and give its issue the role's code.
 *
 * @param error - What a conversion threw.
 * @param code - The issue code of the role reporting it.
 * @returns The carried issue, or `undefined` when the failure is not an engine delivery.
 */
export const engineIssue = (error: unknown, code: KernelIssueCode): KernelIssue | undefined => {
  for (let current = error, depth = 0; current instanceof Error && depth < 8; current = current.cause, depth += 1) {
    if (current instanceof CadmpegEngineError) {
      const [issue] = current.issues;
      return issue.code === 'KERNEL_NOT_PREPARED' ? issue : { ...issue, code };
    }
  }
  return undefined;
};
