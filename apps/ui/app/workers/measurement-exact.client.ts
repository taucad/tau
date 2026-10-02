import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import type { Rendering, RuntimeDocument, SourceRevision } from '@taucad/runtime';
import type { cadMachine } from '#machines/cad.machine.js';
import { bestRouteForActiveKernel, exportDocumentWithValidatedInput } from '#utils/export-formats.utils.js';
import { runExactRequest } from '#workers/measurement-exact.transport.js';
import type { ExactRequest, ExactResponse } from './measurement-exact.worker.js';

export type ExactOccurrenceDistanceResult =
  | {
      status: 'cad-geometry';
      distanceMeters: number;
      pointAMeters: [number, number, number];
      pointBMeters: [number, number, number];
      source: 'ap242';
    }
  | { status: 'unavailable'; reason: string };

export type ExactOccurrenceDistanceInput = {
  cadRef: ActorRefFrom<typeof cadMachine>;
  manifest: GeometryComponentManifest;
  presentedGeometryHash: string;
  occurrenceA: string;
  occurrenceB: string;
  signal?: AbortSignal;
};

let nextRequestId = 0;

function unavailable(reason: string): ExactOccurrenceDistanceResult {
  return { status: 'unavailable', reason };
}

function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

type PresentedBaseline = { rendering: Rendering; document: RuntimeDocument; entryPath: string | undefined };

const sameSourceRevision = (left: SourceRevision | undefined, right: SourceRevision | undefined): boolean => {
  if (!left || !right || left.entry !== right.entry) {
    return false;
  }
  const paths = Object.keys(left.files);
  return (
    paths.length === Object.keys(right.files).length && paths.every((path) => left.files[path] === right.files[path])
  );
};

function presentedRevisionMatches(input: ExactOccurrenceDistanceInput, baseline?: PresentedBaseline): boolean {
  const { context } = input.cadRef.getSnapshot();
  const { rendering } = context;
  return (
    context.activeKernelId === 'replicad' &&
    context.latestRenderingOutcome === 'success' &&
    rendering?.success === true &&
    !rendering.transient &&
    rendering.hash === input.presentedGeometryHash &&
    rendering.sourceRevision !== undefined &&
    input.manifest.geometryHash === input.presentedGeometryHash &&
    context.entryPath === input.manifest.sourceFile &&
    (baseline === undefined ||
      (rendering === baseline.rendering &&
        context.entryPath === baseline.entryPath &&
        context.document === baseline.document))
  );
}

/** Query the exact whole-occurrence minimum from the native handle behind the presented Replicad render. */
export async function measureExactOccurrenceDistance(
  input: ExactOccurrenceDistanceInput,
): Promise<ExactOccurrenceDistanceResult> {
  if (isCancelled(input.signal)) {
    return unavailable('The exact query was cancelled.');
  }
  if (!presentedRevisionMatches(input)) {
    return unavailable('The displayed model is not the settled Replicad source.');
  }
  const { manifest, occurrenceA, occurrenceB } = input;
  if (occurrenceA === occurrenceB) {
    return unavailable('Select two distinct components.');
  }
  const nameA = manifest.nodesById[occurrenceA]?.name;
  const nameB = manifest.nodesById[occurrenceB]?.name;
  if (
    !nameA ||
    !nameB ||
    nameA === nameB ||
    manifest.nodeOrder.filter((id) => manifest.nodesById[id]?.name === nameA).length !== 1 ||
    manifest.nodeOrder.filter((id) => manifest.nodesById[id]?.name === nameB).length !== 1
  ) {
    return unavailable('The displayed components have no unique authored occurrence names.');
  }
  const { context } = input.cadRef.getSnapshot();
  const { rendering: currentRendering, document } = context;
  if (!currentRendering?.success || !document) {
    return unavailable('The displayed model is not the settled Replicad source.');
  }
  const baseline: PresentedBaseline = {
    rendering: currentRendering,
    entryPath: context.entryPath,
    document,
  };
  if (!presentedRevisionMatches(input, baseline)) {
    return unavailable('The displayed model changed before AP242 export.');
  }
  const client = context.kernelClient;
  const route = client && bestRouteForActiveKernel(client, 'step', context.activeKernelId);
  if (!route || route.transcoderId !== undefined || route.kernelId !== 'replicad') {
    return unavailable('This render has no direct Replicad AP242 export route.');
  }
  try {
    const exported = await exportDocumentWithValidatedInput(document, route, {
      options: { coordinateSystem: 'y-up' },
      signal: input.signal,
    });
    if (isCancelled(input.signal) || !presentedRevisionMatches(input, baseline)) {
      return unavailable('The displayed model changed during AP242 export.');
    }
    if (!exported.success || exported.files.length !== 1) {
      return unavailable('AP242 export failed.');
    }
    if (
      exported.evaluationId !== baseline.rendering.evaluationId ||
      !sameSourceRevision(exported.sourceRevision, baseline.rendering.sourceRevision)
    ) {
      return unavailable('The displayed model changed during AP242 export.');
    }
    const id = ++nextRequestId;
    const request: ExactRequest = {
      id,
      source: { format: 'ap242', bytes: exported.files[0].bytes, coordinateSystem: 'y-up' },
      occurrences: [{ name: nameA }, { name: nameB }],
    };
    const result: ExactResponse = await runExactRequest(request, input.signal);
    if (isCancelled(input.signal) || !presentedRevisionMatches(input, baseline)) {
      return unavailable('The displayed model changed during the exact query.');
    }
    const { id: _id, ...answer } = result;
    return answer;
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : 'Exact AP242 query failed.');
  }
}
