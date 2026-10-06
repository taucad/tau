import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import type { Rendering, RuntimeDocument, SourceRevision } from '@taucad/runtime';
import type { PublishedPartAsset, PublishedAssemblyComponentPlacement } from '@taucad/runtime/types';
import { selectCadDisplay } from '#machines/cad.machine.js';
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
  /** Captured from the committed presentation's admitted occurrence metadata and solver pose, never mesh world matrices. */
  assemblyPose?: Readonly<{
    root: PublishedPartAsset;
    placements: readonly PublishedAssemblyComponentPlacement[];
    isCurrent: () => boolean;
  }>;
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

async function measurePinnedOccurrenceDistance(
  input: ExactOccurrenceDistanceInput,
): Promise<ExactOccurrenceDistanceResult> {
  const pose = input.assemblyPose;
  const initial = input.cadRef.getSnapshot();
  const display = selectCadDisplay(initial);
  if (!pose || !display || !('admitted' in display) || display.root !== pose.root) {
    return unavailable(
      'Pinned assembly exact measurement requires the committed root and captured placement-only pose.',
    );
  }
  const { context } = initial;
  const client = context.kernelClient;
  const { document } = display;
  const requestId = context.lastRequestedRenderId;
  const matches = (): boolean => {
    const snapshot = input.cadRef.getSnapshot();
    return (
      !isCancelled(input.signal) &&
      selectCadDisplay(snapshot) === display &&
      snapshot.context.kernelClient === client &&
      snapshot.context.latestRenderingOutcome === 'success' &&
      snapshot.context.lastRequestedRenderId === requestId &&
      snapshot.context.lastSettledRenderId === requestId &&
      snapshot.context.entryPath === input.manifest.sourceFile &&
      input.manifest.geometryHash === pose.root.digest &&
      input.presentedGeometryHash === pose.root.digest &&
      pose.isCurrent()
    );
  };
  const { occurrenceA, occurrenceB, manifest } = input;
  if (occurrenceA === occurrenceB || !manifest.nodesById[occurrenceA] || !manifest.nodesById[occurrenceB]) {
    return unavailable('Select two distinct admitted components.');
  }
  const capturedIds = new Set(pose.placements.map(({ componentId }) => componentId));
  if (capturedIds.size !== pose.placements.length || !capturedIds.has(occurrenceA) || !capturedIds.has(occurrenceB)) {
    return unavailable('Exact measurement requires unique captured placement for both selected canonical components.');
  }
  const route = client && bestRouteForActiveKernel(client, 'step', display.admitted.publication);
  if (!route || route.transcoderId !== undefined || route.kernelId !== 'replicad') {
    return unavailable('This pinned scene has no direct installed Replicad exact export route.');
  }
  try {
    if (!matches()) {
      return unavailable('The presented root or pose changed before exact export.');
    }
    const exported = await document.exportPublished({
      format: 'step',
      publishedAssembly: { root: pose.root, placements: pose.placements },
      exportOptions: { coordinateSystem: 'y-up' },
      signal: input.signal,
    });
    if (!matches()) {
      return unavailable('The presented root or pose changed during exact export.');
    }
    if (!exported.success || exported.files.length !== 1) {
      return unavailable(exported.issues[0]?.message ?? 'Pinned exact pose export failed.');
    }
    // Codec-v2 composition names each placed native entry by its admitted canonical component ID.
    const request: ExactRequest = {
      id: ++nextRequestId,
      source: { format: 'ap242', bytes: exported.files[0].bytes, coordinateSystem: 'y-up' },
      occurrences: [{ name: occurrenceA }, { name: occurrenceB }],
    };
    const result = await runExactRequest(request, input.signal);
    if (!matches()) {
      return unavailable('The presented root or pose changed during the exact query.');
    }
    const { id: _id, ...answer } = result;
    return answer;
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : 'Pinned exact pose query failed.');
  }
}

/** Query the exact whole-occurrence minimum from the native handle behind the presented Replicad render. */
export async function measureExactOccurrenceDistance(
  input: ExactOccurrenceDistanceInput,
): Promise<ExactOccurrenceDistanceResult> {
  if (isCancelled(input.signal)) {
    return unavailable('The exact query was cancelled.');
  }
  if (input.cadRef.getSnapshot().context.publishedAssemblyRoot) {
    return measurePinnedOccurrenceDistance(input);
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
