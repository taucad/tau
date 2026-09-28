/* eslint-disable @typescript-eslint/naming-convention -- Emscripten exports C symbols with leading underscores. */
/** The selected Emscripten MODULARIZE=1 ES module initializer. */
declare const createModule: (options?: {
  readonly locateFile?: (path: string) => string;
  readonly wasmBinary?: Uint8Array<ArrayBuffer>;
}) => Promise<{
  readonly HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(length: number): number;
  _free(pointer: number): void;
  _geospec_engine_native_input_alloc(length: number): number;
  _geospec_engine_native_input_free(pointer: number, length: number): void;
  _geospec_engine_native_engine_new(): number;
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
}>;

export default createModule;
