import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';
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

function presentedRevisionMatches(
  input: ExactOccurrenceDistanceInput,
  baseline?: { requestId: number; entryPath: string | undefined; client: unknown },
): boolean {
  const { context } = input.cadRef.getSnapshot();
  return (
    context.activeKernelId === 'replicad' &&
    context.latestGeometryOutcome === 'success' &&
    context.lastRequestedRenderId === context.lastSettledRenderId &&
    context.geometry?.hash === input.presentedGeometryHash &&
    input.manifest.geometryHash === input.presentedGeometryHash &&
    context.entryPath === input.manifest.sourceFile &&
    (baseline === undefined ||
      (context.lastRequestedRenderId === baseline.requestId &&
        context.entryPath === baseline.entryPath &&
        context.kernelClient === baseline.client))
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
  const baseline = {
    requestId: context.lastRequestedRenderId,
    entryPath: context.entryPath,
    client: context.kernelClient,
  };
  if (!presentedRevisionMatches(input, baseline)) {
    return unavailable('The displayed model changed before AP242 export.');
  }
  const client = context.kernelClient;
  const route = client && bestRouteForActiveKernel(client, 'step', context.activeKernelId);
  if (!client || !route || route.transcoderId !== undefined || route.kernelId !== 'replicad') {
    return unavailable('This render has no direct Replicad AP242 export route.');
  }
  try {
    const exported = await exportWithRuntimeValidatedInput(client, route, {
      exportOptions: { coordinateSystem: 'y-up' },
    });
    if (isCancelled(input.signal) || !presentedRevisionMatches(input, baseline)) {
      return unavailable('The displayed model changed during AP242 export.');
    }
    if (!exported.success || exported.data.length !== 1) {
      return unavailable('AP242 export failed.');
    }
    const stepText = new TextDecoder().decode(exported.data[0]!.bytes);
    const id = ++nextRequestId;
    const request: ExactRequest = { id, stepText, nameA, nameB };
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
