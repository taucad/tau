import type {
  OpenCascadeInstance,
  ReplicadBooleanBatchResult,
  ReplicadMeshData,
  ReplicadUserBreak,
  TopoDS_Shape,
  TopTools_ListOfShape,
} from 'replicad-opencascadejs';
import { checkAbort } from '@taucad/runtime/kernel';

/** The Emscripten module property the native indicator calls on the main runtime thread. */
type UserBreakHookHost = { replicadUserBreak?: () => boolean };

/**
 * Let a superseded operation stop inside the long native calls Replicad makes: the batch boolean
 * (`fuse`, `cut`, `cutAll`, `intersect`) and the mesh extractor. The OCCT progress indicator polls
 * `oc.replicadUserBreak`, which asks the same `checkAbort()` the exception proxy calls before every
 * OpenCascade call, so a native call stops once the document's abort word moves instead of running
 * to the end. The plain entry points become their `...WithOptions` forms with the same arguments and
 * the default OBB and clean flags; while nothing aborts, the result is the same.
 *
 * A stopped call throws the error `checkAbort()` raised, which is the `RenderAbortedError` the proxy
 * would have thrown on the next call. A build without the native user break is left unchanged.
 *
 * @param oc - The realm's raw OpenCascade instance, before any proxy wraps it.
 */
export function installNativeUserBreak(oc: OpenCascadeInstance): void {
  const batch = oc.ReplicadBooleanBatch;
  const extractor = oc.ReplicadMeshExtractor;
  if (
    typeof oc.ReplicadUserBreak !== 'function' ||
    typeof batch.CutWithOptions !== 'function' ||
    typeof extractor.extractWithOptions !== 'function'
  ) {
    return;
  }

  // The error `checkAbort()` threw inside the hook; the native side keeps the break sticky.
  const state: { stop?: { readonly error: unknown } } = {};
  (oc as OpenCascadeInstance & UserBreakHookHost).replicadUserBreak = (): boolean => {
    if (state.stop) {
      return true;
    }
    try {
      checkAbort();
      return false;
    } catch (error) {
      // The hook must not throw: a JavaScript exception would unwind through OCCT.
      state.stop = { error };
      return true;
    }
  };
  // Read through a call: the hook sets `state.stop` while `call()` runs, which narrowing cannot see.
  const takeStop = (): { readonly error: unknown } | undefined => state.stop;
  /* oxlint-disable new-cap -- OCCT exposes callable C++ PascalCase methods. */
  const userBreak: ReplicadUserBreak = new oc.ReplicadUserBreak(0, 0, true);

  /** Run one native call; when the hook stopped it, throw what `checkAbort()` threw. */
  const run = <T>(call: () => T, stopped: (value: T) => boolean): T => {
    state.stop = undefined;
    let value: T;
    try {
      value = call();
    } catch (error) {
      return rethrow(takeStop()?.error ?? error);
    }
    const stop = takeStop();
    if (stop && stopped(value)) {
      return rethrow(stop.error);
    }
    return value;
  };
  const booleanStopped = (result: ReplicadBooleanBatchResult): boolean => {
    if (!result.IsUserBreak()) {
      return false;
    }
    result.delete();
    return true;
  };
  const neverStopped = (): boolean => false;
  const {
    FuseWithOptions: fuseWithOptions,
    CutWithOptions: cutWithOptions,
    CommonWithOptions: commonWithOptions,
  } = batch;
  const { meshWithOptions, extractWithOptions } = extractor;

  batch.Fuse = (shapes: TopTools_ListOfShape, ...options: BooleanOptions) =>
    run(() => fuseWithOptions(shapes, ...options, false, userBreak), booleanStopped);
  batch.Cut = (shapes: TopTools_ListOfShape, tools: TopTools_ListOfShape, ...options: BooleanOptions) =>
    run(() => cutWithOptions(shapes, tools, ...options, false, userBreak), booleanStopped);
  batch.Common = (shapes: TopTools_ListOfShape, ...options: BooleanOptions) =>
    run(() => commonWithOptions(shapes, ...options, false, userBreak), booleanStopped);
  extractor.mesh = (shape: TopoDS_Shape, tolerance: number, angularTolerance: number) => {
    run(() => {
      meshWithOptions(shape, tolerance, angularTolerance, true, userBreak);
    }, neverStopped);
  };
  extractor.extract = (shape: TopoDS_Shape, ...options: ExtractOptions) =>
    run<ReplicadMeshData>(() => extractWithOptions(shape, ...options, true, userBreak), neverStopped);
  /* oxlint-enable new-cap */
}

/** `tolerance, angularTolerance, skipNormals` of the plain `ReplicadMeshExtractor.extract`. */
type ExtractOptions = [tolerance: number, angularTolerance: number, skipNormals: boolean];

/** `nonDestructive, glue, simplify, angularTolerance, fuzzyValue` of the plain batch boolean entry points. */
type BooleanOptions = [
  nonDestructive: boolean,
  glue: number,
  simplify: boolean,
  angularTolerance: number,
  fuzzyValue: number,
];

/**
 * Throw a caught value unchanged, so a stopped call fails exactly as `checkAbort()` did.
 *
 * @param error - What `checkAbort()` or the native call threw.
 */
function rethrow(error: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- rethrows the caught value with its identity intact
  throw error;
}
