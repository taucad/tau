/* eslint-disable @typescript-eslint/naming-convention -- Emscripten exposes C symbols with leading underscores. */
import { appendHostObservationCopies, observeHostCopy, ProtocolError } from '#host-types.js';
import type { HostBytes, HostCopyObservations } from '#host-types.js';

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Input accepted by the compiled Emscripten module. @public */
export type WasmInput =
  | ArrayBuffer
  | HostBytes
  | Response
  | URL
  | string
  | Promise<ArrayBuffer | HostBytes | Response | URL | string>;

/** Ordered external binary resources paired with request metadata. @public */
export type WasmResources = readonly HostBytes[];

/** Requested WASM product and caller-inclusive execution budget. @public */
export type WasmExecution =
  | { readonly variant: 'st' }
  | { readonly variant: 'mt'; readonly permits: number; readonly receipt: URL | string };

type ModuleOptions = {
  readonly locateFile?: (path: string) => string;
  readonly wasmBinary?: HostBytes;
};

type ModuleFactory = (options?: ModuleOptions) => Promise<MixedWasmModule>;

type MixedWasmModule = {
  readonly HEAPU8: Uint8Array<ArrayBuffer>;
  /** MT only: the shared memory, whose buffer is current after a grow on any thread. */
  readonly wasmMemory?: WebAssembly.Memory;
  _malloc(length: number): number;
  _free(pointer: number): void;
  _geospec_engine_native_input_alloc(length: number): number;
  _geospec_engine_native_input_free(pointer: number, length: number): void;
  _geospec_engine_native_engine_new(): number;
  _geospec_engine_native_engine_new_with_execution_permits?(permits: number): number;
  _geospec_engine_native_engine_drop(engine: number): void;
  _geospec_engine_native_observations(engine: number): number;
  _geospec_engine_native_canonicalize(input: number, inputLength: number): number;
  _geospec_engine_native_ingest_mesh(
    engine: number,
    request: number,
    requestLength: number,
    mesh: number,
    meshLength: number,
  ): number;
  _geospec_engine_native_ingest_subject(
    engine: number,
    request: number,
    requestLength: number,
    primary: number,
    primaryLength: number,
    resources: number,
    resourceCount: number,
  ): number;
  _geospec_engine_native_subject_handle(engine: number, request: number, requestLength: number): number;
  _geospec_engine_native_release_subject(engine: number, request: number, requestLength: number): number;
  _geospec_engine_native_process_request(engine: number, request: number, requestLength: number): number;
  _geospec_engine_native_canonical_plan(engine: number, request: number, requestLength: number): number;
  _geospec_engine_native_evaluate_plan(engine: number, plan: number, planLength: number): number;
  _geospec_engine_native_evaluate_claim(engine: number, request: number, requestLength: number): number;
  _geospec_engine_native_result_is_error(result: number): number;
  _geospec_engine_native_result_length(result: number): number;
  _geospec_engine_native_result_pointer(result: number): number;
  _geospec_engine_native_result_code_length(result: number): number;
  _geospec_engine_native_result_code_pointer(result: number): number;
  _geospec_engine_native_result_message_length(result: number): number;
  _geospec_engine_native_result_message_pointer(result: number): number;
  _geospec_engine_native_result_drop(result: number): void;
};

const ordinaryBytes = (value: unknown): HostBytes => {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer)) {
    throw new ProtocolError('invalid-request', 'Host input must use an ordinary ArrayBuffer.');
  }
  return value as HostBytes;
};

const ordinaryResources = (value: unknown): HostBytes[] => {
  if (!Array.isArray(value)) {
    throw new ProtocolError('invalid-request', 'Host resources must be an array of ordinary ArrayBuffer views.');
  }
  return value.map((resource) => ordinaryBytes(resource));
};

const moduleOptions = async (input?: WasmInput): Promise<ModuleOptions | undefined> => {
  const resolved = await input;
  if (resolved === undefined) {
    return undefined;
  }
  if (resolved instanceof Uint8Array) {
    return { wasmBinary: ordinaryBytes(resolved) };
  }
  if (resolved instanceof ArrayBuffer) {
    return { wasmBinary: new Uint8Array(resolved) };
  }
  if (resolved instanceof Response) {
    return { wasmBinary: new Uint8Array(await resolved.arrayBuffer()) };
  }
  return { locateFile: () => resolved.toString() };
};

let modulePromise: Promise<MixedWasmModule> | undefined;
let loadedModule: MixedWasmModule | undefined;
const mtModules = new Map<string, { promise: Promise<MixedWasmModule>; module?: MixedWasmModule }>();

const requireAvailableExecution = (execution?: WasmExecution): URL | undefined => {
  if (execution?.variant !== 'mt') {
    return undefined;
  }
  if (!Number.isSafeInteger(execution.permits) || execution.permits < 1 || execution.permits > 4_294_967_295) {
    throw new ProtocolError('invalid-request', 'MT execution permits must be a positive wasm32 integer.');
  }
  const isNode = typeof process !== 'undefined' && typeof process.versions.node === 'string';
  if (typeof SharedArrayBuffer === 'undefined' || (!isNode && !globalThis.crossOriginIsolated)) {
    throw new ProtocolError(
      'unsupported-capability',
      'GeoSpec MT WASM requires a cross-origin-isolated browser worker.',
    );
  }
  if (!execution.receipt) {
    throw new ProtocolError(
      'unsupported-capability',
      `No MT build receipt was supplied for mt-permits-${execution.permits}.`,
    );
  }
  let url: URL;
  try {
    url = new URL(execution.receipt);
  } catch {
    throw new ProtocolError('invalid-request', 'MT build receipt must be an absolute URL.');
  }
  if (isNode ? url.protocol !== 'file:' : url.origin !== location.origin) {
    throw new ProtocolError(
      'unsupported-capability',
      'MT assets must use a local Node file or same-origin browser URL.',
    );
  }
  return url;
};

type MtAsset = { file: string; bytes: number; sha256: string };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const receiptAsset = (value: unknown, file: string): MtAsset => {
  if (
    !record(value) ||
    value['file'] !== file ||
    typeof value['bytes'] !== 'number' ||
    !Number.isSafeInteger(value['bytes']) ||
    value['bytes'] < 1 ||
    typeof value['sha256'] !== 'string' ||
    !/^[\da-f]{64}$/.test(value['sha256'])
  ) {
    throw new ProtocolError('unsupported-capability', `MT receipt has no valid ${file} asset.`);
  }
  return { file, bytes: value['bytes'], sha256: value['sha256'] };
};

const assetBytes = async (url: URL): Promise<Uint8Array<ArrayBuffer>> => {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return Uint8Array.from(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new ProtocolError('unsupported-capability', `MT asset is unavailable: ${url.href}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const verifiedAsset = async (base: URL, asset: MtAsset): Promise<Uint8Array<ArrayBuffer>> => {
  const { file } = asset;
  const bytes = await assetBytes(new URL(file, base));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (bytes.byteLength !== asset.bytes || hash !== asset.sha256) {
    throw new ProtocolError('unsupported-capability', `MT asset does not match its build receipt: ${file}`);
  }
  return bytes;
};

const loadMtModule = async (url: URL, permits: number): Promise<MixedWasmModule> => {
  const receipt: unknown = JSON.parse(decoder.decode(await assetBytes(url)));
  // A product linked for N caller-inclusive permits serves any smaller grant; its pthread pool is the cap.
  if (
    !record(receipt) ||
    receipt['schema'] !== 'geospec-mixed-mt-assets-v1' ||
    typeof receipt['permits'] !== 'number' ||
    !Number.isSafeInteger(receipt['permits']) ||
    receipt['permits'] < permits
  ) {
    throw new ProtocolError('unsupported-capability', `MT receipt does not describe mt-permits-${permits}.`);
  }
  const productPermits = receipt['permits'];
  const glue = receiptAsset(receipt['glue'], 'geospec_engine_native.mjs');
  const wasm = receiptAsset(receipt['wasm'], 'geospec_engine_native.wasm');
  const worker = receiptAsset(receipt['worker'], 'geospec_engine_native.mjs');
  const buildAsset = receiptAsset(receipt['buildReceipt'], 'build-receipt.json');
  if (worker.bytes !== glue.bytes || worker.sha256 !== glue.sha256) {
    throw new ProtocolError('unsupported-capability', `MT receipt does not describe mt-permits-${permits}.`);
  }
  const base = new URL('.', url);
  const buildReceiptBytes = await verifiedAsset(base, buildAsset);
  const buildReceipt: unknown = JSON.parse(decoder.decode(buildReceiptBytes));
  if (
    !record(buildReceipt) ||
    buildReceipt['schema'] !== 'geospec-mixed-build-receipt-mt-v1' ||
    !record(buildReceipt['mtSettings']) ||
    buildReceipt['mtSettings']['executionPermits'] !== productPermits ||
    !Array.isArray(buildReceipt['artifacts']) ||
    ![glue, wasm].every((asset) =>
      (buildReceipt['artifacts'] as unknown[]).some(
        (entry) =>
          record(entry) &&
          typeof entry['path'] === 'string' &&
          entry['path'].endsWith(`/${asset.file}`) &&
          entry['bytes'] === asset.bytes &&
          entry['sha256'] === asset.sha256,
      ),
    )
  ) {
    throw new ProtocolError('unsupported-capability', 'MT assets do not match their qualified build receipt.');
  }
  await verifiedAsset(base, glue);
  const wasmBinary = await verifiedAsset(base, wasm);
  const glueUrl = new URL(glue.file, base);
  const binding = (await import(/* @vite-ignore */ glueUrl.href)) as { readonly default?: unknown };
  if (typeof binding.default !== 'function') {
    throw new ProtocolError('unsupported-capability', 'MT module has no initializer.');
  }
  const module = await (binding.default as ModuleFactory)({ wasmBinary });
  if (typeof module._geospec_engine_native_engine_new_with_execution_permits !== 'function') {
    throw new ProtocolError('unsupported-capability', 'MT module has no execution-permits constructor.');
  }
  // Without its shared memory, a view taken after a pthread grew memory can be stale; refuse such (pre-fix) products.
  if (!(module.wasmMemory?.buffer instanceof SharedArrayBuffer)) {
    throw new ProtocolError('unsupported-capability', 'MT module does not export wasmMemory; relink the MT product.');
  }
  return module;
};

/**
 * Initialize the single compiled mixed-WASM module instance.
 * @internal
 * @param input - Optional module bytes or artifact location.
 * @param execution - Explicit ST or MT product selection.
 */
export const initializeMixedWasm = async (input?: WasmInput, execution?: WasmExecution): Promise<void> => {
  const mtUrl = requireAvailableExecution(execution);
  if (mtUrl !== undefined && execution?.variant === 'mt') {
    if (input !== undefined) {
      throw new ProtocolError('invalid-request', 'MT WASM bytes are selected by the build receipt.');
    }
    const key = `${execution.permits}:${mtUrl.href}`;
    let entry = mtModules.get(key);
    if (entry === undefined) {
      const created = {
        promise: loadMtModule(mtUrl, execution.permits),
        module: undefined as MixedWasmModule | undefined,
      };
      entry = created;
      mtModules.set(key, created);
    }
    try {
      entry.module = await entry.promise;
    } catch (error) {
      if (mtModules.get(key) === entry) {
        mtModules.delete(key);
      }
      throw error;
    }
    return;
  }
  modulePromise ??= (async () => {
    const binding = (await import('#mixed-wasm-binding')) as {
      readonly default?: unknown;
    };
    if (typeof binding.default !== 'function') {
      throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module has no initializer.');
    }
    loadedModule = await (binding.default as ModuleFactory)(await moduleOptions(input));
    return loadedModule;
  })();
  await modulePromise;
};

const initializedModule = (execution?: WasmExecution): MixedWasmModule => {
  const mtUrl = requireAvailableExecution(execution);
  if (mtUrl !== undefined && execution?.variant === 'mt') {
    const entry = mtModules.get(`${execution.permits}:${mtUrl.href}`);
    if (entry?.module === undefined) {
      throw new ProtocolError('invalid-request', 'Initialize the selected MT product before constructing an engine.');
    }
    return entry.module;
  }
  if (modulePromise === undefined) {
    throw new ProtocolError('invalid-request', 'Call initialize() before using the GeoSpec WASM engine.');
  }
  if (loadedModule === undefined) {
    throw new ProtocolError('invalid-request', 'Wait for initialize() before using the GeoSpec WASM engine.');
  }
  return loadedModule;
};

/**
 * Current byte view of module memory. A pthread that grows shared memory refreshes only its own views, so the
 * main thread's HEAPU8 can cover the old length; take the view after the last call that can allocate.
 * @param module - Initialized ST or MT module.
 * @returns A view over the whole current memory.
 */
const heap = (module: MixedWasmModule): Uint8Array<ArrayBuffer> => {
  const buffer = module.wasmMemory?.buffer;
  return buffer === undefined || buffer === module.HEAPU8.buffer ? module.HEAPU8 : new Uint8Array(buffer);
};

/**
 * Copy host bytes into one registered input; the caller never receives the pointer when the copy fails, so
 * release it here.
 * @param module - Module that registered the input.
 * @param pointer - Registered input address.
 * @param bytes - Exact host bytes.
 */
const copyInput = (module: MixedWasmModule, pointer: number, bytes: HostBytes): void => {
  try {
    heap(module).set(bytes, pointer);
  } catch (error) {
    if (pointer !== 0) {
      module._geospec_engine_native_input_free(pointer, bytes.byteLength);
    }
    throw error;
  }
};

const allocate = (module: MixedWasmModule, bytes: HostBytes, copies?: HostCopyObservations): number => {
  const pointer = module._geospec_engine_native_input_alloc(bytes.byteLength);
  if (bytes.byteLength !== 0 && pointer === 0) {
    throw new ProtocolError('limit-exceeded', 'Compiled GeoSpec WASM module could not register input bytes.');
  }
  copyInput(module, pointer, bytes);
  if (copies) {
    observeHostCopy(copies, 'input', bytes.byteLength);
  }
  return pointer;
};

const allocateTransferred = (module: MixedWasmModule, bytes: HostBytes, copies?: HostCopyObservations): number => {
  const pointer = module._geospec_engine_native_input_alloc(bytes.byteLength);
  if (bytes.byteLength !== 0 && pointer === 0) {
    throw new ProtocolError('limit-exceeded', 'Compiled GeoSpec WASM module could not allocate binary input bytes.');
  }
  copyInput(module, pointer, bytes);
  if (copies) {
    observeHostCopy(copies, 'input', bytes.byteLength);
  }
  return pointer;
};

type ResultBytes = {
  readonly copies?: HostCopyObservations | undefined;
  readonly length: (result: number) => number;
  readonly pointer: (result: number) => number;
};

const copyResultBytes = (module: MixedWasmModule, result: number, access: ResultBytes): HostBytes => {
  // oxlint-disable-next-line no-bitwise -- Emscripten exposes wasm32 unsigned metadata as signed JS i32 values.
  const byteLength = access.length(result) >>> 0;
  // oxlint-disable-next-line no-bitwise -- Normalize the private wasm32 address before range arithmetic.
  const pointer = access.pointer(result) >>> 0;
  if (byteLength === 0) {
    return new Uint8Array(0);
  }
  // Metadata calls can grow memory. Acquire the current view only afterward,
  // then copy synchronously before any observer, allocator or result drop.
  const view = heap(module);
  if (pointer === 0 || pointer > view.byteLength || byteLength > view.byteLength - pointer) {
    throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module returned an inconsistent byte range.');
  }
  const bytes = Uint8Array.from(view.subarray(pointer, pointer + byteLength));
  if (access.copies) {
    observeHostCopy(access.copies, 'output', byteLength);
  }
  return bytes;
};

const readResult = (module: MixedWasmModule, result: number, copies?: HostCopyObservations): HostBytes => {
  if (result === 0) {
    throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module returned no result.');
  }
  try {
    if (module._geospec_engine_native_result_is_error(result) !== 0) {
      const code = copyResultBytes(module, result, {
        copies,
        length: (handle) => module._geospec_engine_native_result_code_length(handle),
        pointer: (handle) => module._geospec_engine_native_result_code_pointer(handle),
      });
      const message = copyResultBytes(module, result, {
        copies,
        length: (handle) => module._geospec_engine_native_result_message_length(handle),
        pointer: (handle) => module._geospec_engine_native_result_message_pointer(handle),
      });
      throw new ProtocolError(decoder.decode(code), decoder.decode(message));
    }
    return copyResultBytes(module, result, {
      copies,
      length: (handle) => module._geospec_engine_native_result_length(handle),
      pointer: (handle) => module._geospec_engine_native_result_pointer(handle),
    });
  } finally {
    module._geospec_engine_native_result_drop(result);
  }
};

const withInput = (
  module: MixedWasmModule,
  input: { bytes: HostBytes; copies?: HostCopyObservations },
  operation: (pointer: number, length: number) => number,
): HostBytes => {
  const pointer = allocate(module, ordinaryBytes(input.bytes), input.copies);
  try {
    return readResult(module, operation(pointer, input.bytes.byteLength), input.copies);
  } finally {
    if (pointer !== 0) {
      module._geospec_engine_native_input_free(pointer, input.bytes.byteLength);
    }
  }
};

/** Exact byte transport over one retained mixed-WASM engine. @internal */
export class MixedWasmBinding {
  readonly #module: MixedWasmModule;
  readonly #copies = { exact: true, inputCopies: 0n, inputBytes: 0n, outputCopies: 0n, outputBytes: 0n };
  #engine: number;

  public constructor(execution?: WasmExecution) {
    this.#module = initializedModule(execution);
    this.#engine =
      execution?.variant === 'mt'
        ? (this.#module._geospec_engine_native_engine_new_with_execution_permits?.(execution.permits) ?? 0)
        : this.#module._geospec_engine_native_engine_new();
    if (this.#engine === 0) {
      throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module could not create an engine.');
    }
  }

  /** Release the retained engine. */
  public close(): void {
    if (this.#engine !== 0) {
      this.#module._geospec_engine_native_engine_drop(this.#engine);
      this.#engine = 0;
    }
  }

  /**
   * Admit exact legacy mesh bytes.
   * @param request - Canonical request bytes.
   * @param mesh - Exact mesh bytes.
   * @returns Canonical response bytes.
   */
  public ingestMesh(request: HostBytes, mesh: HostBytes): HostBytes {
    const meshBytes = ordinaryBytes(mesh);
    const engine = this.engine();
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (requestPointer, requestLength) => {
      const meshPointer = allocateTransferred(this.#module, meshBytes, this.#copies);
      let transferred = false;
      try {
        transferred = true;
        return this.#module._geospec_engine_native_ingest_mesh(
          engine,
          requestPointer,
          requestLength,
          meshPointer,
          meshBytes.byteLength,
        );
      } finally {
        if (!transferred && meshPointer !== 0) {
          this.#module._geospec_engine_native_input_free(meshPointer, meshBytes.byteLength);
        }
      }
    });
  }

  /**
   * Admit exact primary bytes and ordered external resources.
   * @param request - Metadata-only canonical request bytes.
   * @param primary - Exact primary subject bytes.
   * @param resources - Exact resource buffers in request metadata order.
   * @returns Canonical admission response bytes.
   */
  public ingestSubject(request: HostBytes, primary: HostBytes, resources: WasmResources): HostBytes {
    const primaryBytes = ordinaryBytes(primary);
    const resourceBytes = ordinaryResources(resources);
    const engine = this.engine();
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (requestPointer, requestLength) => {
      const transferred: Array<{
        readonly pointer: number;
        readonly length: number;
      }> = [];
      let table = 0;
      let tableLength = 0;
      let entered = false;
      try {
        transferred.push({
          pointer: allocateTransferred(this.#module, primaryBytes, this.#copies),
          length: primaryBytes.byteLength,
        });
        for (const bytes of resourceBytes) {
          transferred.push({
            pointer: allocateTransferred(this.#module, bytes, this.#copies),
            length: bytes.byteLength,
          });
        }
        tableLength = resourceBytes.length * 8;
        table = this.#module._geospec_engine_native_input_alloc(tableLength);
        if (tableLength !== 0 && table === 0) {
          throw new ProtocolError(
            'limit-exceeded',
            'Compiled GeoSpec WASM module could not allocate the resource table.',
          );
        }
        const view = new DataView(heap(this.#module).buffer);
        for (let index = 1; index < transferred.length; index += 1) {
          const resource = transferred[index];
          if (resource === undefined) {
            throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM resource table is incomplete.');
          }
          const offset = table + (index - 1) * 8;
          view.setUint32(offset, resource.pointer, true);
          view.setUint32(offset + 4, resource.length, true);
        }
        const primaryInput = transferred[0];
        if (primaryInput === undefined) {
          throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM primary input is missing.');
        }
        entered = true;
        return this.#module._geospec_engine_native_ingest_subject(
          engine,
          requestPointer,
          requestLength,
          primaryInput.pointer,
          primaryInput.length,
          table,
          resourceBytes.length,
        );
      } finally {
        if (table !== 0) {
          this.#module._geospec_engine_native_input_free(table, tableLength);
        }
        if (!entered) {
          for (const input of transferred) {
            if (input.pointer !== 0) {
              this.#module._geospec_engine_native_input_free(input.pointer, input.length);
            }
          }
        }
      }
    });
  }

  /**
   * Acquire the stable owner/generation token for one admitted subject.
   * @param request - Exact subject identity control bytes.
   * @returns Exact subject-handle response bytes.
   */
  public subjectHandle(request: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_subject_handle(this.engine(), pointer, length),
    );
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_release_subject(this.engine(), pointer, length),
    );
  }

  /**
   * Process one protocol request.
   * @param request - Canonical request bytes.
   * @returns Canonical response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_process_request(this.engine(), pointer, length),
    );
  }

  /**
   * Normalize one claim request.
   * @param request - Canonical request bytes.
   * @returns Canonical plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_canonical_plan(this.engine(), pointer, length),
    );
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Canonical plan bytes.
   * @returns Canonical response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: plan, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_evaluate_plan(this.engine(), pointer, length),
    );
  }

  /**
   * Canonicalize and evaluate a one-claim request.
   * @param request - Exact submitClaims request bytes with exactly one claim.
   * @returns The core's plan, claim and result frame.
   */
  public evaluateClaim(request: HostBytes): HostBytes {
    return withInput(this.#module, { bytes: request, copies: this.#copies }, (pointer, length) =>
      this.#module._geospec_engine_native_evaluate_claim(this.engine(), pointer, length),
    );
  }

  /**
   * Non-mutating observation snapshot, excluding its own transport copies.
   * @returns Owned cumulative diagnostic bytes.
   */
  public observations(): HostBytes {
    const bytes = readResult(this.#module, this.#module._geospec_engine_native_observations(this.engine()));
    return appendHostObservationCopies(bytes, this.#copies);
  }

  private engine(): number {
    if (this.#engine === 0) {
      throw new ProtocolError('invalid-request', 'GeoSpec WASM engine is closed.');
    }
    return this.#engine;
  }
}

/**
 * Canonicalize bytes through any initialized ST or MT compiled module.
 * @internal
 * @param input - Exact input bytes.
 * @returns Canonical JSON bytes.
 */
export const canonicalizeMixedWasm = (input: HostBytes): HostBytes => {
  // Canonicalization is engine-free core code compiled identically into every product, so an MT-only host
  // canonicalizes through its MT module; the ST refusal remains when nothing is initialized.
  const module =
    loadedModule ?? [...mtModules.values()].find((entry) => entry.module !== undefined)?.module ?? initializedModule();
  return withInput(module, { bytes: input }, (pointer, length) =>
    module._geospec_engine_native_canonicalize(pointer, length),
  );
};
