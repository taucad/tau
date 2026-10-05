import { assertRootedPath } from '@taucad/utils/path';
import type { TelemetrySpanRecord } from '@taucad/runtime/types';

/** Compound worker identity; finite batch anchors are clock data, not tracer generations. */
export const publicationSpanKey = (entry: TelemetrySpanRecord): string => {
  const id = entry.detail?.['spanId'];
  if (
    !entry.origin.instance ||
    !entry.origin.label ||
    typeof id !== 'string' ||
    !/^\d+$/u.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !Number.isFinite(entry.startTime) ||
    !Number.isFinite(entry.duration) ||
    entry.duration < 0 ||
    !Number.isFinite(entry.epoch) ||
    !Number.isFinite(entry.workerTimeOrigin)
  ) {
    throw new Error('The mixed runtime span has no safe compound producer identity.');
  }
  return `${entry.origin.instance}:${id}`;
};

/** Qualify the selected completed operation, independently of unrelated whole-root retention. */
const completedPublicationGraph = (
  before: readonly TelemetrySpanRecord[],
  entries: readonly TelemetrySpanRecord[],
  { root, minimumEntries = 3 }: Readonly<{ root: TelemetrySpanRecord; minimumEntries?: 1 | 2 | 3 }>,
): readonly TelemetrySpanRecord[] => {
  if (before.length >= 2000 || entries.length >= 2000) {
    throw new Error('The mixed trace reached its retained entry ceiling.');
  }
  const rootKey = publicationSpanKey(root);
  const rootId = Number(root.detail?.['spanId']);
  const priorIds = before
    .filter((entry) => entry.origin.instance === root.origin.instance)
    .map((entry) => {
      publicationSpanKey(entry);
      return Number(entry.detail?.['spanId']);
    });
  if (priorIds.length === 0 || rootId <= Math.max(...priorIds) || root.detail?.['parentSpanId'] !== undefined) {
    throw new Error('The selected publication has no new captured producer root.');
  }
  const byId = new Map(entries.map((entry) => [publicationSpanKey(entry), entry]));
  if (byId.size !== entries.length || byId.get(rootKey) !== root) {
    throw new Error('The selected publication root is missing or its span identity is duplicated.');
  }
  const descendants = entries.filter((entry) => {
    if (entry.origin.instance !== root.origin.instance || Number(entry.detail?.['spanId']) < rootId) {
      return false;
    }
    let current = entry;
    const visited = new Set<string>();
    while (publicationSpanKey(current) !== rootKey) {
      const parent = current.detail?.['parentSpanId'];
      if (parent === undefined) {
        return false;
      }
      if (typeof parent !== 'string' || !/^\d+$/u.test(parent) || !Number.isSafeInteger(Number(parent))) {
        throw new Error('Invalid selected publication parent.');
      }
      if (Number(parent) < rootId) {
        return false;
      }
      const key = `${current.origin.instance}:${parent}`;
      if (visited.has(key)) {
        throw new Error('Cyclic selected publication ancestry.');
      }
      visited.add(key);
      const ancestor = byId.get(key);
      if (!ancestor) {
        throw new Error('Truncated selected publication ancestry.');
      }
      current = ancestor;
    }
    return true;
  });
  const ids = descendants.map((entry) => Number(entry.detail?.['spanId']));
  if (
    descendants.length < minimumEntries ||
    Math.min(...ids) !== rootId ||
    Math.max(...ids) - rootId + 1 !== descendants.length ||
    descendants.at(-1) !== root
  ) {
    throw new Error('The selected publication graph has a gap or is not completed root-last.');
  }
  // A closed operation can cross flushes, each with its own absolute clock anchor.
  if (
    !Number.isFinite(root.epoch) ||
    descendants.some(
      (entry) => entry.workerTimeOrigin !== root.workerTimeOrigin || entry.origin.label !== root.origin.label,
    )
  ) {
    throw new Error('The selected publication graph changed its captured producer or realm origin.');
  }
  return descendants;
};

/** Select one actual completed snapshot before unrelated reads evict its publication graph. */
export const capturedPublicationGraph = (
  before: readonly TelemetrySpanRecord[],
  captures: ReadonlyArray<readonly TelemetrySpanRecord[]>,
  digest: string,
): Readonly<{ captureIndex: number; entries: readonly TelemetrySpanRecord[]; root: TelemetrySpanRecord }> => {
  const prior = new Set(before.map((entry) => publicationSpanKey(entry)));
  const roots = captures.flatMap((entries, captureIndex) =>
    entries
      .filter(
        (entry) =>
          !prior.has(publicationSpanKey(entry)) &&
          entry.name === 'kernel.render' &&
          entry.detail?.['file'] === 'assembly.json' &&
          entry.detail['status'] === 'published' &&
          entry.detail['digest'] === digest,
      )
      .map((root) => ({ captureIndex, entries, root })),
  );
  if (new Set(roots.map(({ root }) => publicationSpanKey(root))).size !== 1) {
    throw new Error('No unique captured publication for the final committed pin.');
  }
  let failure: unknown;
  for (const candidate of roots.toReversed()) {
    try {
      completedPublicationGraph(before, candidate.entries, { root: candidate.root });
      return candidate;
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error('No complete captured publication graph.');
};

/** Attribute producer phases through actual compute, describe, or bound pre-evaluate publication owners. */
const qualifyProducerPhases = (
  before: readonly TelemetrySpanRecord[],
  entries: readonly TelemetrySpanRecord[],
  {
    graph,
    publication = false,
    ...expected
  }: Readonly<{
    graph: readonly TelemetrySpanRecord[];
    entryPath: string;
    kernelId: string;
    publication?: boolean;
  }>,
): void => {
  const phases = new Set(['kernel.bundle', 'kernel.execute', 'kernel.compute.reuse']);
  const prior = new Set(before.map((entry) => publicationSpanKey(entry)));
  const selected = new Map(graph.map((entry) => [publicationSpanKey(entry), entry]));
  const evaluations = graph.filter((entry) => entry.name === 'kernel.evaluate-model');
  const describes = graph.filter((entry) => entry.name === 'kernel.extract-params');
  const evaluation = evaluations.at(0);
  const describe = describes.at(0);
  let describeOwner: TelemetrySpanRecord | undefined = describe;
  while (describeOwner && describeOwner !== evaluation) {
    const parent: unknown = describeOwner.detail?.['parentSpanId'];
    describeOwner = typeof parent === 'string' ? selected.get(`${describeOwner.origin.instance}:${parent}`) : undefined;
  }
  const boundPublicationBundle =
    publication &&
    evaluations.length === 1 &&
    describes.length === 1 &&
    evaluation !== undefined &&
    describe !== undefined &&
    describeOwner === evaluation &&
    evaluation.detail?.['file'] === expected.entryPath &&
    describe.detail?.['entryPath'] === expected.entryPath &&
    describe.detail['kernelId'] === expected.kernelId;
  for (const entry of entries) {
    if (!phases.has(entry.name) || prior.has(publicationSpanKey(entry))) {
      continue;
    }
    let owner: TelemetrySpanRecord | undefined = selected.get(publicationSpanKey(entry));
    while (owner && owner.name !== 'kernel.compute') {
      if (publication && owner.name === 'kernel.extract-params') {
        break;
      }
      const parent: unknown = owner.detail?.['parentSpanId'];
      owner = typeof parent === 'string' ? selected.get(`${owner.origin.instance}:${parent}`) : undefined;
    }
    const ownedPhase =
      owner !== undefined &&
      owner.detail?.['entryPath'] === expected.entryPath &&
      owner.detail['kernelId'] === expected.kernelId;
    const ownedBundle =
      entry.name === 'kernel.bundle' &&
      boundPublicationBundle &&
      selected.has(publicationSpanKey(entry)) &&
      entry.detail?.['entryPath'] === expected.entryPath;
    if (
      (!ownedPhase && !ownedBundle) ||
      (entry.detail?.['entryPath'] !== undefined && entry.detail['entryPath'] !== expected.entryPath) ||
      (entry.detail?.['kernelId'] !== undefined && entry.detail['kernelId'] !== expected.kernelId)
    ) {
      throw new Error('Unexpected or unattributed nested producer phase.');
    }
  }
};

/** Keep direct attribution strict unless joined to the exact closed authored assembly receipt. */
export const selectedPublicationGraph = (
  before: readonly TelemetrySpanRecord[],
  entries: readonly TelemetrySpanRecord[],
  expected: Readonly<
    { entryPath: string; kernelId: string } & (
      | {
          root: TelemetrySpanRecord;
          publishedAssembly?: Readonly<{
            digest: string;
            generation: number;
            sourceFiles: Readonly<Record<string, string>>;
            glbDigest: string;
          }>;
        }
      | { document: HeldDocument; displayedDocument?: HeldDocument; peerPreparation?: HeldDocument }
    )
  >,
): readonly TelemetrySpanRecord[] => {
  if ('document' in expected) {
    return selectedDocumentGraph(before, entries, expected);
  }
  const { root } = expected;
  const descendants = completedPublicationGraph(before, entries, { root });
  const { publishedAssembly } = expected;
  if (publishedAssembly !== undefined) {
    if (
      root.name !== 'kernel.render' ||
      root.detail?.['file'] !== 'assembly.json' ||
      root.detail['status'] !== 'published' ||
      root.detail['digest'] !== publishedAssembly.digest ||
      !/^sha256:[a-f\d]{64}$/u.test(publishedAssembly.digest) ||
      root.detail['generation'] !== publishedAssembly.generation ||
      !Number.isSafeInteger(publishedAssembly.generation) ||
      publishedAssembly.generation < 1
    ) {
      throw new Error('The direct graph has no exact authored assembly receipt and committed generation.');
    }
    qualifyCacheActions(descendants);
    qualifyPublicationGeometry(descendants, { ...expected, ...publishedAssembly });
  }
  qualifyProducerPhases(before, entries, {
    graph: descendants,
    ...expected,
    publication: publishedAssembly !== undefined,
  });
  const selected = new Set(descendants.map((entry) => publicationSpanKey(entry)));
  const priorKeys = new Set(before.map((entry) => publicationSpanKey(entry)));
  for (const entry of entries) {
    if (entry.name !== 'kernel.compute' && entry.name !== 'kernel.mesh-compute') {
      continue;
    }
    if (priorKeys.has(publicationSpanKey(entry))) {
      continue;
    }
    if (
      !selected.has(publicationSpanKey(entry)) ||
      entry.detail?.['entryPath'] !== expected.entryPath ||
      entry.detail['kernelId'] !== expected.kernelId
    ) {
      throw new Error('Unexpected or unattributed producer work in the captured publication interval.');
    }
  }
  for (const name of ['kernel.compute', 'kernel.mesh-compute']) {
    if (!descendants.some((entry) => entry.name === name)) {
      throw new Error('The selected publication has no complete compute and mesh work.');
    }
  }
  return descendants;
};

/** Values already retained by the committed ordinary document projection. */
type HeldDocument = Readonly<{
  documentId?: string;
  evaluationId: string;
  requestId: string;
  key: string;
  sourceFiles: Readonly<Record<string, string>>;
}>;

const fileClosure = (files: Readonly<Record<string, string>>): string => {
  if (
    Object.keys(files).length === 0 ||
    Object.entries(files).some(
      ([path, digest]) =>
        !path || assertRootedPath(path) !== path || (digest !== 'missing' && !/^sha256:[a-f\d]{64}$/u.test(digest)),
    )
  ) {
    throw new Error('Missing supported exact source closure.');
  }
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
};

const meshClosure = (mesh: TelemetrySpanRecord): string => {
  const encoded = mesh.detail?.['fileDependencies'];
  if (typeof encoded !== 'string') {
    throw new TypeError('Missing exact mesh file dependencies.');
  }
  const values: unknown = JSON.parse(encoded);
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('Unsupported mesh file dependencies.');
  }
  const files = new Map<string, string>();
  const members: readonly unknown[] = values;
  for (const value of members) {
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.keys(value).sort().join(',') !== 'contentHash,path,type' ||
      !('type' in value) ||
      value.type !== 'file' ||
      !('path' in value) ||
      typeof value.path !== 'string' ||
      !value.path ||
      assertRootedPath(value.path) !== value.path ||
      !('contentHash' in value) ||
      typeof value.contentHash !== 'string' ||
      (value.contentHash !== 'missing' && !/^[a-f\d]{64}$/u.test(value.contentHash))
    ) {
      throw new TypeError('Unsupported mesh file dependency member.');
    }
    const digest = value.contentHash === 'missing' ? 'missing' : `sha256:${value.contentHash}`;
    if (files.has(value.path) && files.get(value.path) !== digest) {
      throw new Error('Conflicting mesh file revisions.');
    }
    files.set(value.path, digest);
  }
  return fileClosure(Object.fromEntries(files));
};

/** Scope settlement records describe lifecycle outcomes, not execution or native recomputation. */
const isScopeSettlement = (entry: TelemetrySpanRecord): boolean => {
  const { detail } = entry;
  return (
    entry.name === 'kernel.compute.reuse' &&
    typeof detail?.['operationId'] === 'string' &&
    detail['operationId'].length > 0 &&
    typeof detail['status'] === 'string' &&
    ['published', 'abandoned', 'failed'].includes(detail['status']) &&
    typeof detail['generation'] === 'number' &&
    Number.isSafeInteger(detail['generation']) &&
    detail['generation'] > 0 &&
    ['published', 'omitted', 'conflicts'].every(
      (key) => typeof detail[key] === 'number' && Number.isSafeInteger(detail[key]) && detail[key] >= 0,
    )
  );
};

const qualifyCacheActions = (graph: readonly TelemetrySpanRecord[]): void => {
  const byKey = new Map(graph.map((entry) => [publicationSpanKey(entry), entry]));
  for (const action of graph.filter((entry) => entry.name.startsWith('cache.'))) {
    const { detail } = action;
    if (
      !['cache.parameter.evaluate', 'cache.geometry.build.evaluate', 'cache.geometry.mesh.evaluate'].includes(
        action.name,
      ) ||
      typeof detail?.['actionDigest'] !== 'string' ||
      !/^sha256:[a-f\d]{64}$/u.test(detail['actionDigest']) ||
      typeof detail['contentDigest'] !== 'string' ||
      !/^sha256:[a-f\d]{64}$/u.test(detail['contentDigest']) ||
      (detail['source'] !== 'cache' && (detail['source'] !== 'computed' || detail['publicationStatus'] !== 'stored'))
    ) {
      throw new Error('Unsupported actual cache action outcome.');
    }
    const requiredWork =
      action.name === 'cache.geometry.build.evaluate'
        ? 'kernel.compute'
        : action.name === 'cache.geometry.mesh.evaluate'
          ? 'kernel.mesh-compute'
          : undefined;
    let hasComputedWork = false;
    for (const work of graph.filter(
      (entry) =>
        ['kernel.compute', 'kernel.mesh-compute', 'kernel.bundle', 'kernel.execute', 'kernel.compute.reuse'].includes(
          entry.name,
        ) && !isScopeSettlement(entry),
    )) {
      let ancestor: TelemetrySpanRecord | undefined = work;
      while (ancestor && ancestor !== action) {
        const parent: unknown = ancestor.detail?.['parentSpanId'];
        ancestor = typeof parent === 'string' ? byKey.get(`${ancestor.origin.instance}:${parent}`) : undefined;
      }
      if (ancestor === action && detail['source'] === 'cache') {
        throw new Error('Native work cannot be substituted into an actual cache HIT.');
      }
      if (ancestor === action && work.name === requiredWork) {
        hasComputedWork = true;
      }
    }
    if (detail['source'] === 'computed' && requiredWork !== undefined && !hasComputedWork) {
      throw new Error('Incomplete computed geometry cache work.');
    }
  }
};

const selectedDocumentGraph = (
  before: readonly TelemetrySpanRecord[],
  entries: readonly TelemetrySpanRecord[],
  {
    document,
    displayedDocument,
    peerPreparation,
    ...expected
  }: Readonly<{
    document: HeldDocument;
    displayedDocument?: HeldDocument;
    peerPreparation?: HeldDocument;
    entryPath: string;
    kernelId: string;
  }>,
): readonly TelemetrySpanRecord[] => {
  if (before.length >= 2000 || entries.length >= 2000) {
    throw new Error('The mixed trace reached its retained entry ceiling.');
  }
  if (!document.evaluationId || !document.requestId || !/^[a-f\d]{64}$/u.test(document.key)) {
    throw new Error('Missing exact held document/evaluation/request tuple.');
  }
  const documents = [document];
  if (displayedDocument) {
    if (
      !displayedDocument.documentId ||
      !displayedDocument.evaluationId ||
      !displayedDocument.requestId ||
      !/^[a-f\d]{64}$/u.test(displayedDocument.key) ||
      displayedDocument.evaluationId !== document.evaluationId ||
      (document.documentId !== undefined && displayedDocument.documentId !== document.documentId) ||
      fileClosure(displayedDocument.sourceFiles) !== fileClosure(document.sourceFiles)
    ) {
      throw new Error('Displayed request has a foreign document/evaluation/source closure.');
    }
    if (displayedDocument.requestId === document.requestId) {
      if (displayedDocument.key !== document.key) {
        throw new Error('One actual request has conflicting output keys.');
      }
    } else {
      documents.push(displayedDocument);
    }
  }
  const prior = new Set(before.map((entry) => publicationSpanKey(entry)));
  const renderings = documents.map((held) => {
    const matches = entries.filter(
      (entry) =>
        !prior.has(publicationSpanKey(entry)) &&
        entry.name === 'kernel.mesh' &&
        entry.detail?.['evaluationId'] === held.evaluationId &&
        entry.detail['requestId'] === held.requestId &&
        entry.detail['dependencyHash'] === held.key,
    );
    const [mesh] = matches;
    if (
      matches.length !== 1 ||
      !mesh ||
      typeof mesh.detail?.['documentId'] !== 'string' ||
      !mesh.detail['documentId'] ||
      (held.documentId !== undefined && held.documentId !== mesh.detail['documentId'])
    ) {
      throw new Error('No unique current-request mesh and actual document identity; memoized association is unproven.');
    }
    const { detail } = mesh;
    const { documentId, subscriptionId } = detail;
    if (typeof documentId !== 'string' || !documentId || typeof subscriptionId !== 'string' || !subscriptionId) {
      throw new Error('No actual closed current view operation identity.');
    }
    const renderOperation = `render:${subscriptionId}:${held.evaluationId}:${held.requestId}`;
    if (detail['operationId'] !== renderOperation) {
      throw new Error('No actual closed current view operation identity.');
    }
    return {
      document: held,
      mesh,
      documentId,
      subscriptionId,
      renderOperation,
      graph: completedPublicationGraph(before, entries, { root: mesh }),
    };
  });
  const [defaultRendering] = renderings;
  if (!defaultRendering) {
    throw new Error('No actual default document rendering.');
  }
  const { mesh, documentId } = defaultRendering;
  const evaluationOperation = `evaluate:${documentId}:${document.evaluationId}`;
  const roots = entries.filter(
    (entry) =>
      !prior.has(publicationSpanKey(entry)) &&
      entry.origin.instance === mesh.origin.instance &&
      entry.detail?.['parentSpanId'] === undefined &&
      entry.detail?.['documentId'] === documentId &&
      entry.detail['evaluationId'] === document.evaluationId &&
      entry.detail['operationId'] === evaluationOperation,
  );
  const rootGraphs = roots.map((root) => ({
    root,
    graph: completedPublicationGraph(before, entries, {
      root,
      minimumEntries: ['kernel.extract-params', 'kernel.resolve-deps'].includes(root.name) ? 1 : 2,
    }),
  }));
  const buildsWithOwner = rootGraphs.filter(({ graph }) =>
    graph.some((entry) => entry.name === 'cache.geometry.build.evaluate'),
  );
  const [buildWithOwner] = buildsWithOwner;
  if (buildsWithOwner.length !== 1 || !buildWithOwner) {
    throw new Error('No unique actual closed evaluation owner graph.');
  }
  const { root: evaluation, graph: evaluationGraph } = buildWithOwner;
  const dependencyGraphs = rootGraphs.filter(({ root }) => root.name === 'kernel.resolve-deps');
  const describe = rootGraphs.filter(({ root }) => root !== evaluation && root.name !== 'kernel.resolve-deps');
  const preparations = entries.filter(
    (entry) => !prior.has(publicationSpanKey(entry)) && entry.name === 'kernel.select',
  );
  if (preparations.length > 1) {
    throw new Error('No unique actual kernel selection preparation.');
  }
  const preparationGraphs = preparations.map((root) => {
    const graph = completedPublicationGraph(before, entries, { root });
    const detections = graph.filter((entry) => entry.name === 'kernel.detect-import');
    const reads = graph.filter((entry) => entry.name === 'fs.read');
    const kernels = detections.map((entry) => entry.detail?.['kernel']);
    let selectedDetection: TelemetrySpanRecord | undefined;
    for (const detection of detections) {
      if (
        selectedDetection === undefined ||
        Number(detection.detail?.['spanId']) > Number(selectedDetection.detail?.['spanId'])
      ) {
        selectedDetection = detection;
      }
    }
    if (
      root.origin.instance !== mesh.origin.instance ||
      root.detail?.['file'] !== expected.entryPath ||
      root.detail['kernelId'] !== expected.kernelId ||
      root.detail['method'] !== 'regex' ||
      detections.length === 0 ||
      reads.length !== detections.length ||
      graph.length !== 1 + detections.length + reads.length ||
      new Set(kernels).size !== kernels.length ||
      kernels.some((kernel) => typeof kernel !== 'string' || kernel.length === 0) ||
      selectedDetection?.detail?.['kernel'] !== expected.kernelId ||
      detections.some(
        (entry) =>
          entry.detail?.['parentSpanId'] !== root.detail?.['spanId'] ||
          reads.filter((read) => read.detail?.['parentSpanId'] === entry.detail?.['spanId']).length !== 1,
      ) ||
      reads.some((entry) => entry.detail?.['path'] !== expected.entryPath) ||
      graph.some((entry) =>
        ['documentId', 'evaluationId', 'operationId', 'requestId', 'subscriptionId'].some(
          (key) => entry.detail?.[key] !== undefined,
        ),
      ) ||
      dependencyGraphs.length === 0 ||
      dependencyGraphs.some(
        ({ root: dependency }) =>
          Math.max(...graph.map((entry) => Number(entry.detail?.['spanId']))) >= Number(dependency.detail?.['spanId']),
      )
    ) {
      throw new Error('Unknown or unattributed actual kernel selection preparation.');
    }
    return { root, graph };
  });
  const renderHashes = renderings.map((rendering) => {
    const matches = entries.filter(
      (entry) =>
        !prior.has(publicationSpanKey(entry)) &&
        entry.name === 'deps.content-hash' &&
        entry.detail?.['operationId'] === rendering.renderOperation,
    );
    if (matches.length > 1) {
      throw new Error('No unique actual render dependency hash.');
    }
    const root = matches.at(0);
    if (root === undefined) {
      return { rendering, graph: [] };
    }
    const graph = completedPublicationGraph(before, entries, { root, minimumEntries: 1 });
    if (
      graph.length !== 1 ||
      root.detail?.['documentId'] !== documentId ||
      root.detail['evaluationId'] !== document.evaluationId ||
      root.detail['subscriptionId'] !== rendering.subscriptionId ||
      root.detail['requestId'] !== rendering.document.requestId ||
      root.detail['entryPath'] !== expected.entryPath ||
      root.detail['kernelId'] !== expected.kernelId ||
      typeof root.detail['dependencyHash'] !== 'string' ||
      !/^[a-f\d]{64}$/u.test(root.detail['dependencyHash']) ||
      Number(root.detail['spanId']) >= Number(rendering.mesh.detail?.['spanId']) ||
      rootGraphs.some(
        ({ graph: operation }) =>
          Math.max(...operation.map((entry) => Number(entry.detail?.['spanId']))) >= Number(root.detail?.['spanId']),
      )
    ) {
      throw new Error('Foreign or unattributed actual render dependency hash.');
    }
    return { rendering, graph };
  });
  // A peer may prepare the same projection without emitting a mesh. Count only its real hash owner.
  let preparedPeer:
    | { document: HeldDocument; subscriptionId: string; renderOperation: string; graph: readonly TelemetrySpanRecord[] }
    | undefined;
  if (peerPreparation !== undefined) {
    if (
      displayedDocument !== undefined ||
      peerPreparation.documentId !== documentId ||
      peerPreparation.evaluationId !== document.evaluationId ||
      !peerPreparation.requestId ||
      peerPreparation.requestId === document.requestId ||
      peerPreparation.key !== document.key ||
      fileClosure(peerPreparation.sourceFiles) !== fileClosure(document.sourceFiles)
    ) {
      throw new Error('Foreign held peer preparation tuple or source/output closure.');
    }
    const matches = entries.filter(
      (entry) =>
        !prior.has(publicationSpanKey(entry)) &&
        entry.name === 'deps.content-hash' &&
        entry.detail?.['requestId'] === peerPreparation.requestId,
    );
    const root = matches.at(0);
    const defaultHash = renderHashes.at(0)?.graph.at(0);
    if (matches.length !== 1 || root === undefined || defaultHash === undefined) {
      throw new Error('No unique peer preparation and verified default dependency hash.');
    }
    const graph = completedPublicationGraph(before, entries, { root, minimumEntries: 1 });
    const subscriptionId = root.detail?.['subscriptionId'];
    const renderOperation = `render:${String(subscriptionId)}:${peerPreparation.evaluationId}:${peerPreparation.requestId}`;
    if (
      graph.length !== 1 ||
      typeof subscriptionId !== 'string' ||
      !subscriptionId ||
      subscriptionId === defaultRendering.subscriptionId ||
      root.detail?.['documentId'] !== documentId ||
      root.detail['evaluationId'] !== document.evaluationId ||
      root.detail['operationId'] !== renderOperation ||
      root.detail['entryPath'] !== expected.entryPath ||
      root.detail['kernelId'] !== expected.kernelId ||
      root.detail['dependencyHash'] !== defaultHash.detail?.['dependencyHash'] ||
      root.origin.instance !== mesh.origin.instance ||
      root.origin.label !== mesh.origin.label ||
      root.workerTimeOrigin !== mesh.workerTimeOrigin ||
      Number(root.detail['spanId']) <=
        Math.max(...defaultRendering.graph.map((entry) => Number(entry.detail?.['spanId'])))
    ) {
      throw new Error('Foreign or incomplete peer render dependency preparation.');
    }
    preparedPeer = { document: peerPreparation, subscriptionId, renderOperation, graph };
  }
  const byKey = new Map(
    [
      ...rootGraphs.flatMap(({ graph }) => graph),
      ...preparationGraphs.flatMap(({ graph }) => graph),
      ...renderHashes.flatMap(({ graph }) => graph),
      ...(preparedPeer?.graph ?? []),
      ...renderings.flatMap(({ graph }) => graph),
    ].map((entry) => [publicationSpanKey(entry), entry]),
  );
  const descendsFrom = (entry: TelemetrySpanRecord, ancestor: TelemetrySpanRecord): boolean => {
    let current: TelemetrySpanRecord | undefined = entry;
    while (current && current !== ancestor) {
      const parent: unknown = current.detail?.['parentSpanId'];
      current = typeof parent === 'string' ? byKey.get(`${current.origin.instance}:${parent}`) : undefined;
    }
    return current === ancestor;
  };
  const exactOwner = (entry: TelemetrySpanRecord): boolean =>
    entry.detail?.['entryPath'] === expected.entryPath &&
    entry.detail['kernelId'] === expected.kernelId &&
    entry.detail['documentId'] === documentId &&
    entry.detail['evaluationId'] === document.evaluationId &&
    entry.detail['operationId'] === evaluationOperation;
  const describeHandlers = describe.flatMap(({ graph }) =>
    graph.filter((entry) => entry.name === 'kernel.extract-params'),
  );
  if (
    describeHandlers.length > 1 ||
    describe.some(({ root, graph }) => {
      const handler = graph.find((entry) => entry.name === 'kernel.extract-params');
      const parameters = graph.filter((entry) => entry.name === 'cache.parameter.evaluate');
      const parameter = parameters.at(0);
      if (handler !== undefined) {
        return (
          !exactOwner(handler) ||
          parameters.length > 1 ||
          (parameter !== undefined && !descendsFrom(handler, parameter))
        );
      }
      // Cached middleware may close before the real standalone producer establishes its declaration.
      const owners = graph.filter((entry) => entry.name === 'middleware.wrap(ParameterCache)');
      const owner = owners.at(0);
      return (
        !exactOwner(root) ||
        parameters.length !== 1 ||
        parameter === undefined ||
        owners.length !== 1 ||
        owner === undefined ||
        !descendsFrom(parameter, owner) ||
        describeHandlers.length !== 1
      );
    }) ||
    dependencyGraphs.some(
      ({ root, graph }) =>
        !exactOwner(root) || graph.filter((entry) => entry.name === 'kernel.resolve-deps').length !== 1,
    )
  ) {
    throw new Error('Unknown or unattributed actual describe/dependency owner.');
  }
  // A real build HIT has exactly the existing owner wrapper and its cache child;
  // its native-work exclusion is verified below. Publication graphs retain their original three-entry floor.
  if (
    renderings.some(
      (rendering) =>
        rendering.documentId !== documentId ||
        rendering.mesh.origin.instance !== mesh.origin.instance ||
        rendering.mesh.workerTimeOrigin !== mesh.workerTimeOrigin ||
        rendering.mesh.origin.label !== mesh.origin.label,
    ) ||
    [...rootGraphs, ...preparationGraphs].some(
      ({ root, graph }) =>
        root.workerTimeOrigin !== mesh.workerTimeOrigin ||
        root.origin.label !== mesh.origin.label ||
        renderings.some(
          (rendering) =>
            Math.max(...graph.map((entry) => Number(entry.detail?.['spanId']))) >=
            Number(rendering.mesh.detail?.['spanId']),
        ),
    )
  ) {
    throw new Error('Disconnected document operations or changed producer origin.');
  }
  if (
    renderHashes.some(({ graph }) =>
      graph.some(
        (entry) =>
          entry.origin.instance !== mesh.origin.instance ||
          entry.origin.label !== mesh.origin.label ||
          entry.workerTimeOrigin !== mesh.workerTimeOrigin,
      ),
    )
  ) {
    throw new Error('Disconnected render dependency hash producer.');
  }
  const graph = [
    ...preparationGraphs.flatMap(({ graph }) => graph),
    ...renderHashes.flatMap(({ graph }) => graph),
    ...(preparedPeer?.graph ?? []),
    ...dependencyGraphs.flatMap(({ graph }) => graph),
    ...describe.flatMap(({ graph }) => graph),
    ...evaluationGraph,
    ...renderings.flatMap(({ graph }) => graph),
  ];
  const keys = new Set(graph.map((entry) => publicationSpanKey(entry)));
  if (keys.size !== graph.length) {
    throw new Error('Overlapping document operations.');
  }
  const builds = evaluationGraph.filter((entry) => entry.name === 'cache.geometry.build.evaluate');
  const build = builds.at(0);
  const geometryOwners = evaluationGraph.filter((entry) => entry.name === 'middleware.wrap(GeometryCache)');
  const geometryOwner = geometryOwners.at(0);
  if (
    builds.length !== 1 ||
    build === undefined ||
    geometryOwners.length !== 1 ||
    geometryOwner === undefined ||
    !descendsFrom(build, geometryOwner)
  ) {
    throw new Error('No actual closed geometry build owner/cache action.');
  }
  for (const entry of graph) {
    const { detail } = entry;
    if (
      detail?.['documentId'] !== undefined &&
      (detail['documentId'] !== documentId || detail['evaluationId'] !== document.evaluationId)
    ) {
      throw new Error('Foreign document/evaluation owner.');
    }
    const rendering =
      renderings.find(({ graph }) => graph.includes(entry)) ??
      renderHashes.find(({ graph }) => graph.includes(entry))?.rendering ??
      (preparedPeer?.graph.includes(entry) ? preparedPeer : undefined);
    if (
      detail?.['operationId'] !== undefined &&
      !isScopeSettlement(entry) &&
      detail['operationId'] !== (rendering ? rendering.renderOperation : evaluationOperation)
    ) {
      throw new Error('Foreign document operation owner.');
    }
    if (
      rendering &&
      ((detail?.['requestId'] !== undefined && detail['requestId'] !== rendering.document.requestId) ||
        (detail?.['subscriptionId'] !== undefined && detail['subscriptionId'] !== rendering.subscriptionId))
    ) {
      throw new Error('Foreign render request owner.');
    }
    if (
      entry.name === 'kernel.compute.reuse' &&
      (detail?.['documentOperationId'] !== undefined ||
        detail?.['status'] !== undefined ||
        detail?.['generation'] !== undefined)
    ) {
      const capturedOperation = detail['documentOperationId'];
      const admittedRendering = renderings.find(({ renderOperation }) => renderOperation === capturedOperation);
      const cacheActions = graph.filter(
        (candidate) =>
          ['cache.geometry.build.evaluate', 'cache.geometry.mesh.evaluate'].includes(candidate.name) &&
          descendsFrom(entry, candidate),
      );
      if (
        !isScopeSettlement(entry) ||
        detail['documentId'] !== documentId ||
        detail['evaluationId'] !== document.evaluationId ||
        detail['entryPath'] !== expected.entryPath ||
        detail['kernelId'] !== expected.kernelId ||
        (capturedOperation !== evaluationOperation && admittedRendering === undefined) ||
        (admittedRendering === undefined
          ? detail['requestId'] !== undefined || detail['subscriptionId'] !== undefined
          : detail['requestId'] !== admittedRendering.document.requestId ||
            detail['subscriptionId'] !== admittedRendering.subscriptionId ||
            rendering !== admittedRendering) ||
        cacheActions.length !== 1
      ) {
        throw new Error('Foreign or unattributed actual compute scope settlement.');
      }
    }
    if (entry.name === 'kernel.compute' || entry.name === 'kernel.mesh-compute') {
      if (
        detail?.['documentId'] !== documentId ||
        detail['evaluationId'] !== document.evaluationId ||
        detail['operationId'] !== (rendering ? rendering.renderOperation : evaluationOperation) ||
        detail['entryPath'] !== expected.entryPath ||
        detail['kernelId'] !== expected.kernelId
      ) {
        throw new Error('Unexpected or unattributed document producer work.');
      }
      let ancestor: TelemetrySpanRecord | undefined = entry;
      const cacheName = evaluationGraph.includes(entry)
        ? 'cache.geometry.build.evaluate'
        : 'cache.geometry.mesh.evaluate';
      while (ancestor && ancestor.name !== cacheName) {
        const parent: unknown = ancestor.detail?.['parentSpanId'];
        ancestor = typeof parent === 'string' ? byKey.get(`${ancestor.origin.instance}:${parent}`) : undefined;
      }
      if (!ancestor) {
        throw new Error('Native work is outside its actual selected cache action.');
      }
    }
  }
  for (const { mesh, document: held } of renderings) {
    if (
      mesh.detail?.['entryPath'] !== expected.entryPath ||
      mesh.detail['kernelId'] !== expected.kernelId ||
      typeof mesh.detail['glbDigest'] !== 'string' ||
      !/^sha256:[a-f\d]{64}$/u.test(mesh.detail['glbDigest']) ||
      meshClosure(mesh) !== fileClosure(held.sourceFiles)
    ) {
      throw new Error('Held document mesh output/source closure changed.');
    }
  }
  qualifyCacheActions(graph);
  const phaseOwners = new Set(
    [
      ...describe.flatMap(({ graph }) => graph.filter((entry) => entry.name === 'kernel.extract-params')),
      ...dependencyGraphs.map(({ root }) => root),
    ].map((owner) => publicationSpanKey(owner)),
  );
  for (const entry of entries.filter(
    (entry) =>
      !prior.has(publicationSpanKey(entry)) &&
      ['kernel.bundle', 'kernel.execute', 'kernel.compute.reuse'].includes(entry.name),
  )) {
    if (keys.has(publicationSpanKey(entry)) && isScopeSettlement(entry)) {
      continue; // Captured admission and actual cache ancestry were qualified above.
    }
    let owner = byKey.get(publicationSpanKey(entry));
    while (owner && owner.name !== 'kernel.compute' && !phaseOwners.has(publicationSpanKey(owner))) {
      const parent: unknown = owner.detail?.['parentSpanId'];
      owner = typeof parent === 'string' ? byKey.get(`${owner.origin.instance}:${parent}`) : undefined;
    }
    if (
      !owner ||
      owner.detail?.['entryPath'] !== expected.entryPath ||
      owner.detail['kernelId'] !== expected.kernelId ||
      (owner.name === 'kernel.resolve-deps' &&
        (entry.name !== 'kernel.bundle' || entry.detail?.['entryPath'] !== expected.entryPath)) ||
      (entry.detail?.['entryPath'] !== undefined && entry.detail['entryPath'] !== expected.entryPath) ||
      (entry.detail?.['kernelId'] !== undefined && entry.detail['kernelId'] !== expected.kernelId)
    ) {
      throw new Error('Unexpected or unattributed describe/build producer phase.');
    }
  }
  const producerBefore = before.filter((entry) => entry.origin.instance === mesh.origin.instance);
  let frontierCandidate = producerBefore[0];
  for (const entry of producerBefore) {
    if (!frontierCandidate || Number(entry.detail?.['spanId']) >= Number(frontierCandidate.detail?.['spanId'])) {
      frontierCandidate = entry;
    }
  }
  const frontier = frontierCandidate;
  if (!frontier) {
    throw new Error('Lost closed document interval frontier.');
  }
  if (
    !entries.some(
      (entry) =>
        publicationSpanKey(entry) === publicationSpanKey(frontier) &&
        JSON.stringify(entry) === JSON.stringify(frontier),
    )
  ) {
    throw new Error('Lost closed document interval frontier.');
  }
  const priorId = Number(frontier.detail?.['spanId']);
  const fresh = entries.filter((entry) => !prior.has(publicationSpanKey(entry)));
  const ids = fresh
    .filter((entry) => entry.origin.instance === mesh.origin.instance)
    .map((entry) => Number(entry.detail?.['spanId']));
  if (ids.length === 0 || Math.min(...ids) !== priorId + 1 || Math.max(...ids) - priorId !== ids.length) {
    throw new Error('Document interval gap or unfinished work.');
  }
  for (const entry of fresh) {
    if (keys.has(publicationSpanKey(entry))) {
      continue;
    }
    if (
      entry.origin.instance !== mesh.origin.instance ||
      entry.workerTimeOrigin !== mesh.workerTimeOrigin ||
      entry.origin.label !== mesh.origin.label ||
      entry.detail?.['documentId'] !== undefined ||
      ![
        'fs.read',
        'fs.exists',
        'fs.readdir',
        'deps.discover',
        'deps.read',
        'deps.hash',
        'kernel.resolve-deps',
        'kernel.extract-params',
      ].includes(entry.name)
    ) {
      throw new Error('Unknown or detached work outside the selected document operations.');
    }
  }
  return graph;
};

/** Qualify every native phase against its actual computed cache handler and exact variant closure. */
const qualifyPublicationGeometry = (
  graph: readonly TelemetrySpanRecord[],
  expected: Readonly<{
    entryPath: string;
    kernelId: string;
    sourceFiles: Readonly<Record<string, string>>;
    glbDigest: string;
  }>,
): void => {
  const byKey = new Map(graph.map((entry) => [publicationSpanKey(entry), entry]));
  for (const work of graph.filter((entry) => entry.name === 'kernel.compute' || entry.name === 'kernel.mesh-compute')) {
    let ancestor: TelemetrySpanRecord | undefined = work;
    const cacheName = work.name === 'kernel.compute' ? 'cache.geometry.build.evaluate' : 'cache.geometry.mesh.evaluate';
    while (ancestor && ancestor.name !== cacheName) {
      const parent: unknown = ancestor.detail?.['parentSpanId'];
      ancestor = typeof parent === 'string' ? byKey.get(`${ancestor.origin.instance}:${parent}`) : undefined;
    }
    if (ancestor?.detail?.['source'] !== 'computed') {
      throw new Error('Assembly native work is outside its actual computed cache action.');
    }
  }
  const meshes = graph.filter((entry) => entry.name === 'kernel.mesh');
  const [mesh] = meshes;
  if (
    meshes.length !== 1 ||
    !mesh ||
    mesh.detail?.['entryPath'] !== expected.entryPath ||
    mesh.detail['kernelId'] !== expected.kernelId ||
    typeof mesh.detail['dependencyHash'] !== 'string' ||
    !/^[a-f\d]{64}$/u.test(mesh.detail['dependencyHash']) ||
    mesh.detail['glbDigest'] !== expected.glbDigest ||
    meshClosure(mesh) !== fileClosure(expected.sourceFiles)
  ) {
    throw new Error('Published variant output/source closure changed.');
  }
};

/** Qualify distinct current document operations and the exact authored assembly receipt without changing cache keys. */
export const pairedPublicationGraphs = (
  {
    assemblyBefore,
    assemblyAfter,
    mainBefore,
    mainAfter,
  }: Readonly<{
    assemblyBefore: readonly TelemetrySpanRecord[];
    assemblyAfter: readonly TelemetrySpanRecord[];
    mainBefore: readonly TelemetrySpanRecord[];
    mainAfter: readonly TelemetrySpanRecord[];
  }>,
  expected: Readonly<{
    root: TelemetrySpanRecord;
    main: HeldDocument;
    displayedDocument?: HeldDocument;
    entryPath: string;
    kernelId: string;
    sourceFiles: Readonly<Record<string, string>>;
    glbDigest: string;
  }>,
): Readonly<{ assembly: readonly TelemetrySpanRecord[]; main: readonly TelemetrySpanRecord[] }> => {
  const assembly = completedPublicationGraph(assemblyBefore, assemblyAfter, { root: expected.root });
  const main = selectedDocumentGraph(mainBefore, mainAfter, { document: expected.main, ...expected });
  const { root } = expected;
  if (
    root.name !== 'kernel.render' ||
    root.detail?.['file'] !== 'assembly.json' ||
    root.detail['status'] !== 'published' ||
    typeof root.detail['digest'] !== 'string' ||
    !/^sha256:[a-f\d]{64}$/u.test(root.detail['digest']) ||
    typeof root.detail['generation'] !== 'number' ||
    !Number.isSafeInteger(root.detail['generation']) ||
    root.detail['generation'] < 1 ||
    fileClosure(expected.main.sourceFiles) !== fileClosure(expected.sourceFiles)
  ) {
    throw new Error('The paired graphs have no exact current receipt and shared source closure.');
  }
  qualifyProducerPhases(assemblyBefore, assemblyAfter, { graph: assembly, publication: true, ...expected });
  qualifyCacheActions(assembly);
  const prior = new Set(assemblyBefore.map((entry) => publicationSpanKey(entry)));
  const selected = new Set(assembly.map((entry) => publicationSpanKey(entry)));
  for (const entry of assemblyAfter) {
    if (prior.has(publicationSpanKey(entry))) {
      continue;
    }
    if (
      !selected.has(publicationSpanKey(entry)) &&
      (entry.origin.instance !== root.origin.instance ||
        entry.workerTimeOrigin !== root.workerTimeOrigin ||
        entry.origin.label !== root.origin.label ||
        !['fs.read', 'fs.exists', 'fs.readdir'].includes(entry.name))
    ) {
      throw new Error('Unexpected assembly producer work outside its receipt.');
    }
    if (
      (entry.name === 'kernel.compute' || entry.name === 'kernel.mesh-compute' || entry.name === 'kernel.mesh') &&
      (entry.detail?.['entryPath'] !== expected.entryPath || entry.detail['kernelId'] !== expected.kernelId)
    ) {
      throw new Error('Unexpected or unattributed assembly producer work.');
    }
  }
  qualifyPublicationGeometry(assembly, expected);
  const assemblyBuilds = assembly.filter((entry) => entry.name === 'cache.geometry.build.evaluate');
  const assemblyBuild = assemblyBuilds.at(0);
  const assemblyBuildHitWithMainCompute =
    assemblyBuilds.length === 1 &&
    assemblyBuild?.detail?.['source'] === 'cache' &&
    main.some((entry) => entry.name === 'kernel.compute') &&
    assembly.some((entry) => entry.name === 'kernel.mesh-compute');
  if (
    (!assembly.some((entry) => entry.name === 'kernel.compute') && !assemblyBuildHitWithMainCompute) ||
    !main.some((entry) => entry.name === 'kernel.mesh-compute')
  ) {
    throw new Error('The paired route lacks actual downstream build and main native mesh work.');
  }
  return { assembly, main };
};
