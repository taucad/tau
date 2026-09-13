/* eslint-disable @typescript-eslint/naming-convention -- Emscripten exposes C symbols with leading underscores. */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { ProtocolError } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package contract type.
import type { HostBytes } from '#host-types.js';

const bindingSpecifier = '#mixed-wasm-binding';
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

type ModuleOptions = {
  readonly locateFile?: (path: string) => string;
  readonly wasmBinary?: HostBytes;
};

type ModuleFactory = (options?: ModuleOptions) => Promise<MixedWasmModule>;

type MixedWasmModule = {
  readonly HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(length: number): number;
  _free(pointer: number): void;
  _geospec_engine_native_input_alloc(length: number): number;
  _geospec_engine_native_input_free(pointer: number, length: number): void;
  _geospec_engine_native_engine_new(): number;
  _geospec_engine_native_engine_drop(engine: number): void;
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
  _geospec_engine_native_result_is_error(result: number): number;
  _geospec_engine_native_result_length(result: number): number;
  _geospec_engine_native_result_copy(result: number, output: number, capacity: number): number;
  _geospec_engine_native_result_code_length(result: number): number;
  _geospec_engine_native_result_code_copy(result: number, output: number, capacity: number): number;
  _geospec_engine_native_result_message_length(result: number): number;
  _geospec_engine_native_result_message_copy(result: number, output: number, capacity: number): number;
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
    return { wasmBinary: Uint8Array.from(new Uint8Array(resolved)) };
  }
  if (resolved instanceof Response) {
    return { wasmBinary: new Uint8Array(await resolved.arrayBuffer()) };
  }
  return { locateFile: () => resolved.toString() };
};

let modulePromise: Promise<MixedWasmModule> | undefined;
let loadedModule: MixedWasmModule | undefined;

/**
 * Initialize the single compiled mixed-WASM module instance.
 * @internal
 * @param input - Optional module bytes or artifact location.
 */
export const initializeMixedWasm = async (input?: WasmInput): Promise<void> => {
  modulePromise ??= (async () => {
    const binding = (await import(bindingSpecifier)) as {
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

const initializedModule = (): MixedWasmModule => {
  if (modulePromise === undefined) {
    throw new ProtocolError('invalid-request', 'Call initialize() before using the GeoSpec WASM engine.');
  }
  if (loadedModule === undefined) {
    throw new ProtocolError('invalid-request', 'Wait for initialize() before using the GeoSpec WASM engine.');
  }
  return loadedModule;
};

const allocate = (module: MixedWasmModule, bytes: HostBytes): number => {
  const pointer = module._geospec_engine_native_input_alloc(bytes.byteLength);
  if (bytes.byteLength !== 0 && pointer === 0) {
    throw new ProtocolError('limit-exceeded', 'Compiled GeoSpec WASM module could not register input bytes.');
  }
  module.HEAPU8.set(bytes, pointer);
  return pointer;
};

const allocateTransferred = (module: MixedWasmModule, bytes: HostBytes): number => {
  const pointer = module._geospec_engine_native_input_alloc(bytes.byteLength);
  if (bytes.byteLength !== 0 && pointer === 0) {
    throw new ProtocolError('limit-exceeded', 'Compiled GeoSpec WASM module could not allocate binary input bytes.');
  }
  module.HEAPU8.set(bytes, pointer);
  return pointer;
};

type ResultBytes = {
  readonly length: (result: number) => number;
  readonly copy: (result: number, output: number, capacity: number) => number;
};

const copyResultBytes = (module: MixedWasmModule, result: number, access: ResultBytes): HostBytes => {
  const byteLength = access.length(result);
  const pointer = module._geospec_engine_native_input_alloc(byteLength);
  if (byteLength !== 0 && pointer === 0) {
    throw new ProtocolError('limit-exceeded', 'Compiled GeoSpec WASM module could not allocate output bytes.');
  }
  try {
    if (access.copy(result, pointer, byteLength) !== byteLength) {
      throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module returned an inconsistent byte length.');
    }
    return Uint8Array.from(module.HEAPU8.subarray(pointer, pointer + byteLength));
  } finally {
    if (pointer !== 0) {
      module._geospec_engine_native_input_free(pointer, byteLength);
    }
  }
};

const readResult = (module: MixedWasmModule, result: number): HostBytes => {
  if (result === 0) {
    throw new ProtocolError('invalid-request', 'Compiled GeoSpec WASM module returned no result.');
  }
  try {
    if (module._geospec_engine_native_result_is_error(result) !== 0) {
      const code = copyResultBytes(module, result, {
        length: (handle) => module._geospec_engine_native_result_code_length(handle),
        copy: (handle, output, capacity) => module._geospec_engine_native_result_code_copy(handle, output, capacity),
      });
      const message = copyResultBytes(module, result, {
        length: (handle) => module._geospec_engine_native_result_message_length(handle),
        copy: (handle, output, capacity) => module._geospec_engine_native_result_message_copy(handle, output, capacity),
      });
      throw new ProtocolError(decoder.decode(code), decoder.decode(message));
    }
    return copyResultBytes(module, result, {
      length: (handle) => module._geospec_engine_native_result_length(handle),
      copy: (handle, output, capacity) => module._geospec_engine_native_result_copy(handle, output, capacity),
    });
  } finally {
    module._geospec_engine_native_result_drop(result);
  }
};

const withInput = (
  module: MixedWasmModule,
  input: HostBytes,
  operation: (pointer: number, length: number) => number,
): HostBytes => {
  const pointer = allocate(module, ordinaryBytes(input));
  try {
    return readResult(module, operation(pointer, input.byteLength));
  } finally {
    if (pointer !== 0) {
      module._geospec_engine_native_input_free(pointer, input.byteLength);
    }
  }
};

/** Exact byte transport over one retained mixed-WASM engine. @internal */
export class MixedWasmBinding {
  readonly #module = initializedModule();
  #engine = this.#module._geospec_engine_native_engine_new();

  public constructor() {
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
    return withInput(this.#module, request, (requestPointer, requestLength) => {
      const meshPointer = allocateTransferred(this.#module, meshBytes);
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
    return withInput(this.#module, request, (requestPointer, requestLength) => {
      const transferred: Array<{
        readonly pointer: number;
        readonly length: number;
      }> = [];
      let table = 0;
      let tableLength = 0;
      let entered = false;
      try {
        transferred.push({
          pointer: allocateTransferred(this.#module, primaryBytes),
          length: primaryBytes.byteLength,
        });
        for (const bytes of resourceBytes) {
          transferred.push({
            pointer: allocateTransferred(this.#module, bytes),
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
        const view = new DataView(this.#module.HEAPU8.buffer);
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
    return withInput(this.#module, request, (pointer, length) =>
      this.#module._geospec_engine_native_subject_handle(this.engine(), pointer, length),
    );
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return withInput(this.#module, request, (pointer, length) =>
      this.#module._geospec_engine_native_release_subject(this.engine(), pointer, length),
    );
  }

  /**
   * Process one protocol request.
   * @param request - Canonical request bytes.
   * @returns Canonical response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return withInput(this.#module, request, (pointer, length) =>
      this.#module._geospec_engine_native_process_request(this.engine(), pointer, length),
    );
  }

  /**
   * Normalize one claim request.
   * @param request - Canonical request bytes.
   * @returns Canonical plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return withInput(this.#module, request, (pointer, length) =>
      this.#module._geospec_engine_native_canonical_plan(this.engine(), pointer, length),
    );
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Canonical plan bytes.
   * @returns Canonical response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return withInput(this.#module, plan, (pointer, length) =>
      this.#module._geospec_engine_native_evaluate_plan(this.engine(), pointer, length),
    );
  }

  private engine(): number {
    if (this.#engine === 0) {
      throw new ProtocolError('invalid-request', 'GeoSpec WASM engine is closed.');
    }
    return this.#engine;
  }
}

/**
 * Canonicalize bytes through the initialized compiled module.
 * @internal
 * @param input - Exact input bytes.
 * @returns Canonical JSON bytes.
 */
export const canonicalizeMixedWasm = (input: HostBytes): HostBytes => {
  const module = initializedModule();
  return withInput(module, input, (pointer, length) => module._geospec_engine_native_canonicalize(pointer, length));
};
