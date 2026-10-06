// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TelemetrySpanRecord } from '@taucad/runtime/types';
/* oxlint-disable no-restricted-imports -- The Node-only owner target runs without browser aliases. */
import {
  capturedPublicationGraph,
  selectedPublicationGraph,
  pairedPublicationGraphs,
} from './selected-publication-graph.ts';
/* oxlint-enable no-restricted-imports */

const span = (id: number, name: string, parent?: number): TelemetrySpanRecord => ({
  name,
  startTime: id,
  duration: 1,
  workerTimeOrigin: 1000,
  epoch: 1000,
  origin: { label: 'worker', instance: 'captured-worker' },
  detail: {
    spanId: String(id),
    ...(parent === undefined ? {} : { parentSpanId: String(parent) }),
    ...(name.startsWith('kernel.') ? { entryPath: 'main.ts', kernelId: 'replicad' } : {}),
  },
});
const fixture = () => {
  const before = Array.from({ length: 20 }, (_, id) => span(id, 'fs.read'));
  const root = span(20, 'kernel.render');
  root.detail = { ...root.detail, status: 'published', digest: 'sha256:current', generation: 2 };
  const compute = span(21, 'kernel.compute', 20);
  const mesh = span(22, 'kernel.mesh-compute', 21);
  return { before, root, compute, mesh, entries: [...before.slice(1), mesh, compute, root] };
};
const expected = { entryPath: 'main.ts', kernelId: 'replicad' };

describe('selected publication graph', () => {
  it('accepts complete selected work at twenty retained roots after irrelevant filesystem eviction', () => {
    const { before, entries, root, compute, mesh } = fixture();
    expect(selectedPublicationGraph(before, entries, { root, ...expected })).toEqual([mesh, compute, root]);
    expect(entries.filter((entry) => entry.detail?.['parentSpanId'] === undefined)).toHaveLength(20);
    expect(entries).not.toContain(before[0]);
  });
  it('should retain ordinary closed ancestry across distinct valid batch clock anchors', () => {
    const value = fixture();
    const mesh = { ...value.mesh, epoch: 1000.125 };
    const compute = { ...value.compute, epoch: 1000.25 };
    const root = { ...value.root, epoch: 999.875 };
    const replacements = new Map([
      [value.mesh, mesh],
      [value.compute, compute],
      [value.root, root],
    ]);
    const entries = value.entries.map((entry) => replacements.get(entry) ?? entry);
    expect(selectedPublicationGraph(value.before, entries, { root, ...expected })).toEqual([mesh, compute, root]);
    expect([mesh.epoch, compute.epoch, root.epoch]).toEqual([1000.125, 1000.25, 999.875]);
  });
  it('selects one complete middle snapshot after final read roots evict the publication', () => {
    const { before, entries, root } = fixture();
    root.detail = { ...root.detail, file: 'assembly.json' };
    const finalReads = Array.from({ length: 20 }, (_, index) => span(23 + index, 'fs.read'));
    const captured = capturedPublicationGraph(before, [entries, finalReads], 'sha256:current');
    expect(captured.captureIndex).toBe(0);
    expect(captured.entries).toBe(entries);
    expect(captured.root).toBe(root);
  });
  it('denies complementary incomplete snapshots instead of merging their descendants', () => {
    const { before, entries, root, compute, mesh } = fixture();
    root.detail = { ...root.detail, file: 'assembly.json' };
    expect(() =>
      capturedPublicationGraph(
        before,
        [entries.filter((entry) => entry !== mesh), entries.filter((entry) => entry !== compute)],
        'sha256:current',
      ),
    ).toThrow();
  });
  it.each(['foreign origin', 'wrong source', 'prior root'])('denies a captured publication with %s', (change) => {
    const { before, entries, root, mesh } = fixture();
    root.detail = { ...root.detail, file: change === 'wrong source' ? 'foreign.json' : 'assembly.json' };
    if (change === 'foreign origin') {
      entries[entries.indexOf(mesh)] = { ...mesh, origin: { label: 'worker', instance: 'foreign-worker' } };
    }
    expect(() =>
      capturedPublicationGraph(change === 'prior root' ? [...before, root] : before, [entries], 'sha256:current'),
    ).toThrow();
  });
  it.each(['kernel.bundle', 'kernel.execute', 'kernel.compute.reuse'])(
    'attributes %s to the captured compute ancestor and rejects detached or foreign work',
    (name) => {
      const { before, entries, root } = fixture();
      const phase = span(23, name, 21);
      phase.detail = { spanId: '23', parentSpanId: '21' };
      const complete = [phase, ...entries];
      expect(selectedPublicationGraph(before, complete, { root, ...expected })).toContain(phase);
      phase.detail = { spanId: '23', parentSpanId: '20' };
      expect(() => selectedPublicationGraph(before, complete, { root, ...expected })).toThrow('nested producer phase');
      phase.detail = { spanId: '23', parentSpanId: '21', entryPath: 'upstream.ts' };
      expect(() => selectedPublicationGraph(before, complete, { root, ...expected })).toThrow('nested producer phase');
      phase.detail = { spanId: '23' };
      expect(() => selectedPublicationGraph(before, complete, { root, ...expected })).toThrow('nested producer phase');
    },
  );
  it('rejects an entry-ceiling suffix that could have lost the highest selected leaf', () => {
    const { before, root, compute, mesh } = fixture();
    // Selected leaf23 can complete first and be cut; retained20..22 alone look contiguous.
    const unrelated = Array.from({ length: 1997 }, (_, id) => ({
      ...span(id, 'fs.read', id === 0 ? undefined : 0),
      origin: { label: 'worker', instance: 'other-retained-worker' },
    }));
    const suffix = [...unrelated, mesh, compute, root];
    expect(suffix).toHaveLength(2000);
    expect(() => selectedPublicationGraph(before, suffix, { root, ...expected })).toThrow('entry ceiling');
  });
  it('rejects a missing selected root and missing selected parent', () => {
    const { before, entries, root, compute } = fixture();
    expect(() =>
      selectedPublicationGraph(
        before,
        entries.filter((entry) => entry !== root),
        { root, ...expected },
      ),
    ).toThrow('root is missing');
    expect(() =>
      selectedPublicationGraph(
        before,
        entries.filter((entry) => entry !== compute),
        { root, ...expected },
      ),
    ).toThrow('Truncated');
  });
  it('rejects a selected allocation gap and incomplete phases', () => {
    const { before, root, compute, mesh, entries } = fixture();
    mesh.detail = { ...mesh.detail, spanId: '23' };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('gap');
    mesh.detail = { ...mesh.detail, spanId: '22' };
    mesh.name = 'fs.read';
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('complete compute and mesh');
    expect(compute.name).toBe('kernel.compute');
  });
  it('rejects cyclic ancestry and a changed child origin', () => {
    const { before, entries, root, compute, mesh } = fixture();
    compute.detail = { ...compute.detail, parentSpanId: '22' };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('Cyclic');
    compute.detail = { ...compute.detail, parentSpanId: '20' };
    entries[entries.indexOf(mesh)] = { ...mesh, origin: { label: 'worker', instance: 'different-worker' } };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow();
  });
  it('rejects unsafe or duplicate identities and a parent completed after its root', () => {
    const { before, entries, root, mesh } = fixture();
    expect(() => selectedPublicationGraph(before, [...entries, mesh], { root, ...expected })).toThrow('duplicated');
    expect(() =>
      selectedPublicationGraph(before, [...entries.filter((entry) => entry !== mesh), mesh], { root, ...expected }),
    ).toThrow('root-last');
    mesh.detail = { ...mesh.detail, spanId: '9007199254740992' };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('safe compound');
  });
  it('rejects unexpected producer work outside the selected root and wrong or missing attribution', () => {
    const { before, entries, root, mesh } = fixture();
    expect(() =>
      selectedPublicationGraph(before, [...entries, span(23, 'kernel.compute')], { root, ...expected }),
    ).toThrow('Unexpected');
    mesh.detail = { ...mesh.detail, entryPath: 'upstream.ts' };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('Unexpected');
    mesh.detail = { spanId: '22', parentSpanId: '21', entryPath: 'main.ts' };
    expect(() => selectedPublicationGraph(before, entries, { root, ...expected })).toThrow('Unexpected');
  });
});

const pairedFixture = (publicationHit = false, publicationBuildHit = false) => {
  const raw = 'f'.repeat(64),
    glbDigest = `sha256:${'e'.repeat(64)}`;
  const sourceFiles = { 'main.ts': `sha256:${raw}`, 'downstream.settings.ts': 'missing' };
  const files = JSON.stringify([
    { type: 'file', path: 'main.ts', contentHash: raw },
    { type: 'file', path: 'downstream.settings.ts', contentHash: 'missing' },
  ]);
  const make = (id: number, name: string, { origin, parent }: Readonly<{ origin: string; parent?: number }>) => ({
    ...span(id, name, parent),
    origin: { label: 'worker', instance: origin },
  });
  const before = (origin: string) => Array.from({ length: 20 }, (_, id) => make(id, 'fs.read', { origin }));
  const actualEvaluation = {
    documentId: 'captured-document',
    evaluationId: 'e1',
    operationId: 'evaluate:captured-document:e1',
  };
  const actualRender = {
    ...actualEvaluation,
    operationId: 'render:captured-view:e1:r1',
    subscriptionId: 'captured-view',
    requestId: 'r1',
  };
  const owned = (
    id: number,
    name: string,
    { parent, render = false }: Readonly<{ parent?: number; render?: boolean }> = {},
  ) => {
    const entry = make(id, name, { origin: 'main-worker', parent });
    entry.detail = {
      ...entry.detail,
      entryPath: 'main.ts',
      kernelId: 'replicad',
      ...(render ? actualRender : actualEvaluation),
    };
    return entry;
  };
  const cache = (
    id: number,
    phase: string,
    { origin, parent, hit = false }: Readonly<{ origin: string; parent: number; hit?: boolean }>,
  ) => {
    const entry = make(id, `cache.geometry.${phase}.evaluate`, { origin, parent });
    entry.detail = {
      ...entry.detail,
      source: hit ? 'cache' : 'computed',
      ...(hit ? {} : { publicationStatus: 'stored' }),
      actionDigest: `sha256:${(origin === 'main-worker' ? 'a' : 'c').repeat(64)}`,
      contentDigest: `sha256:${(origin === 'main-worker' ? 'b' : 'd').repeat(64)}`,
    };
    return entry;
  };
  const describe = owned(20, 'kernel.extract-params');
  const describeBundle = make(21, 'kernel.bundle', { origin: 'main-worker', parent: 20 });
  const describeExecute = make(22, 'kernel.execute', { origin: 'main-worker', parent: 21 });
  const evaluation = owned(23, 'middleware.wrap(GeometryCache)');
  const build = cache(24, 'build', { origin: 'main-worker', parent: 23 });
  const producer = owned(25, 'kernel.compute', { parent: 24 });
  const execute = make(26, 'kernel.execute', { origin: 'main-worker', parent: 25 });
  const mainMesh = owned(27, 'kernel.mesh', { render: true });
  mainMesh.detail = {
    ...mainMesh.detail,
    dependencyHash: raw,
    fileDependencies: files,
    glbDigest: `sha256:${'9'.repeat(64)}`,
  };
  const mainWrapper = owned(28, 'middleware.wrap(GeometryCache)', { parent: 27, render: true });
  const meshBuild = cache(29, 'mesh', { origin: 'main-worker', parent: 28 });
  const meshProducer = owned(30, 'kernel.mesh-compute', { parent: 29, render: true });
  const root = make(20, 'kernel.render', { origin: 'assembly-worker' });
  root.detail = {
    spanId: '20',
    file: 'assembly.json',
    status: 'published',
    digest: `sha256:${'8'.repeat(64)}`,
    generation: 2,
  };
  const internal = make(21, 'kernel.evaluate-model', { origin: 'assembly-worker', parent: 20 });
  const buildWrapper = make(22, 'middleware.wrap(GeometryCache)', { origin: 'assembly-worker', parent: 21 });
  const buildHit = cache(23, 'build', { origin: 'assembly-worker', parent: 22, hit: publicationBuildHit });
  const assemblyCompute = make(24, 'kernel.compute', { origin: 'assembly-worker', parent: 23 });
  const hitMesh = make(publicationBuildHit ? 24 : 25, 'kernel.mesh', { origin: 'assembly-worker', parent: 21 });
  hitMesh.detail = { ...hitMesh.detail, dependencyHash: '7'.repeat(64), fileDependencies: files, glbDigest };
  const hitWrapper = make(publicationBuildHit ? 25 : 26, 'middleware.wrap(GeometryCache)', {
    origin: 'assembly-worker',
    parent: publicationBuildHit ? 24 : 25,
  });
  const meshHit = cache(publicationBuildHit ? 26 : 27, 'mesh', {
    origin: 'assembly-worker',
    parent: publicationBuildHit ? 25 : 26,
    hit: publicationHit,
  });
  const assemblyMeshCompute = make(publicationBuildHit ? 27 : 28, 'kernel.mesh-compute', {
    origin: 'assembly-worker',
    parent: publicationBuildHit ? 26 : 27,
  });
  const mainBefore = before('main-worker'),
    assemblyBefore = before('assembly-worker');
  const mainAfter = [
    ...mainBefore.slice(1),
    describeExecute,
    describeBundle,
    describe,
    execute,
    producer,
    build,
    evaluation,
    meshProducer,
    meshBuild,
    mainWrapper,
    mainMesh,
  ];
  const assemblyAfter = [
    ...assemblyBefore.slice(1),
    ...(publicationBuildHit ? [] : [assemblyCompute]),
    buildHit,
    buildWrapper,
    ...(publicationHit ? [] : [assemblyMeshCompute]),
    meshHit,
    hitWrapper,
    hitMesh,
    internal,
    root,
  ];
  const main: Parameters<typeof pairedPublicationGraphs>[1]['main'] = {
    documentId: actualEvaluation.documentId,
    evaluationId: 'e1',
    requestId: 'r1',
    key: raw,
    sourceFiles,
  };
  const expectedPair = { root, main, entryPath: 'main.ts', kernelId: 'replicad', sourceFiles, glbDigest };
  return {
    mainBefore,
    assemblyBefore,
    mainAfter,
    assemblyAfter,
    expectedPair,
    describe,
    describeExecute,
    evaluation,
    producer,
    meshProducer,
    mainMesh,
    meshBuild,
    assemblyCompute,
    hitMesh,
    meshHit,
    buildHit,
    build,
  };
};
const qualifyPair = (value: ReturnType<typeof pairedFixture>) =>
  pairedPublicationGraphs(
    {
      assemblyBefore: value.assemblyBefore,
      assemblyAfter: value.assemblyAfter,
      mainBefore: value.mainBefore,
      mainAfter: value.mainAfter,
    },
    value.expectedPair,
  );

// Existing controlled document fixture with the real r41 ParameterUnits/Observability/dependency topology.
const wrappedDocumentFixture = () => {
  const value = pairedFixture();
  const identity = {
    documentId: 'captured-document',
    evaluationId: 'e1',
    operationId: 'evaluate:captured-document:e1',
  };
  const ids = new Map([
    ['20', '23'],
    ['21', '24'],
    ['22', '25'],
    ['23', '26'],
    ['24', '29'],
    ['25', '30'],
    ['26', '31'],
    ['27', '32'],
    ['28', '33'],
    ['29', '34'],
    ['30', '36'],
  ]);
  for (const entry of value.mainAfter.filter((entry) => Number(entry.detail?.['spanId']) >= 20)) {
    const parent = entry.detail?.['parentSpanId'];
    entry.detail = {
      ...entry.detail,
      spanId: ids.get(String(entry.detail?.['spanId'])),
      ...(typeof parent === 'string' ? { parentSpanId: ids.get(parent) } : {}),
    };
  }
  const owned = (id: number, name: string, parent?: number): TelemetrySpanRecord => ({
    ...span(id, name, parent),
    origin: value.describe.origin,
    detail: {
      spanId: String(id),
      ...(parent === undefined ? {} : { parentSpanId: String(parent) }),
      ...identity,
      entryPath: 'main.ts',
      kernelId: 'replicad',
    },
  });
  const dependencies = owned(20, 'kernel.resolve-deps');
  const discovery = { ...span(21, 'deps.discover', 20), origin: value.describe.origin };
  const bundle: TelemetrySpanRecord = {
    ...span(22, 'kernel.bundle', 21),
    origin: value.describe.origin,
    detail: { spanId: '22', parentSpanId: '21', entryPath: 'main.ts', phase: 'bundling' },
  };
  const handler = value.mainAfter.find((entry) => entry.detail?.['spanId'] === '24');
  const execute = value.mainAfter.find((entry) => entry.detail?.['spanId'] === '31');
  const meshWrapper = value.mainAfter.find((entry) => entry.detail?.['spanId'] === '33');
  if (!handler || !execute || !meshWrapper) {
    throw new Error('Expected the existing controlled producer fixture.');
  }
  value.describe.name = 'middleware.wrap(ParameterUnits)';
  handler.name = 'kernel.extract-params';
  handler.detail = { ...handler.detail, ...identity, entryPath: 'main.ts', kernelId: 'replicad' };
  value.evaluation.name = 'middleware.wrap(Observability)';
  value.evaluation.detail = { spanId: '26', ...identity };
  const resolver = owned(27, 'middleware.wrap(ParameterFileResolver)', 26);
  const geometry = owned(28, 'middleware.wrap(GeometryCache)', 27);
  value.build.detail = { ...value.build.detail, parentSpanId: '28' };
  const scope = owned(35, 'kernel.compute.reuse', 34);
  scope.detail = {
    ...scope.detail,
    operationId: 'actual-capability',
    documentOperationId: identity.operationId,
    generation: 1,
    status: 'published',
    published: 0,
    omitted: 0,
    conflicts: 0,
  };
  value.mainAfter = [
    ...value.mainBefore.slice(1),
    bundle,
    discovery,
    dependencies,
    value.describeExecute,
    handler,
    value.describe,
    execute,
    value.producer,
    value.build,
    geometry,
    resolver,
    value.evaluation,
    scope,
    value.meshProducer,
    value.meshBuild,
    meshWrapper,
    value.mainMesh,
  ];
  return { ...value, dependencies, bundle, handler, resolver, geometry, scope };
};

describe('captured document admission and real middleware topology', () => {
  it('admits exact wrapped describe, nested build, dependency bundle and lifecycle settlement before the mesh handler', () => {
    const value = wrappedDocumentFixture();
    const graph = qualifyPair(value).main;
    expect(graph).toContain(value.handler);
    expect(graph).toContain(value.bundle);
    expect(graph).toContain(value.producer);
    expect(graph).toContain(value.scope);
    expect(value.scope.detail?.['operationId']).toBe('actual-capability');
    expect(value.scope.detail?.['parentSpanId']).toBe('34');
    expect(graph.filter((entry) => entry.name === 'kernel.extract-params')).toHaveLength(1);
  });
  it('retains a real cached parameter owner and the separately admitted producer declaration', () => {
    const value = wrappedDocumentFixture();
    value.describe.name = 'middleware.wrap(ParameterCache)';
    value.handler.name = 'cache.parameter.evaluate';
    value.handler.detail = {
      ...value.handler.detail,
      source: 'cache',
      actionDigest: `sha256:${'1'.repeat(64)}`,
      contentDigest: `sha256:${'2'.repeat(64)}`,
    };
    value.describeExecute.name = 'kernel.extract-params';
    value.describeExecute.detail = { ...value.describe.detail, spanId: '25' };
    const graph = qualifyPair(value).main;
    expect(graph).toContain(value.handler);
    expect(graph).toContain(value.describeExecute);
    expect(graph.filter((entry) => entry.name === 'kernel.extract-params')).toHaveLength(1);
  });
  it('admits a lifecycle settlement without calling it native work in a genuine mesh HIT', () => {
    const value = wrappedDocumentFixture();
    value.mainAfter = value.mainAfter.filter((entry) => entry !== value.meshProducer);
    value.meshBuild.detail = { ...value.meshBuild.detail, source: 'cache' };
    const graph = selectedPublicationGraph(value.mainBefore, value.mainAfter, {
      document: value.expectedPair.main,
      ...expected,
    });
    expect(graph).toContain(value.scope);
    expect(graph.some((entry) => entry.name === 'kernel.mesh-compute')).toBe(false);
  });
  it('binds a render-admitted scope to the exact held request rather than the current callback operation', () => {
    const value = wrappedDocumentFixture();
    value.scope.detail = {
      ...value.scope.detail,
      documentOperationId: 'render:captured-view:e1:r1',
      subscriptionId: 'captured-view',
      requestId: 'r1',
    };
    expect(qualifyPair(value).main).toContain(value.scope);
    value.scope.detail = { ...value.scope.detail, requestId: 'other-request' };
    expect(() => qualifyPair(value)).toThrow();
  });
  it.each(['documentId', 'evaluationId', 'documentOperationId', 'entryPath', 'kernelId'] as const)(
    'denies a scope with foreign or absent captured %s',
    (field) => {
      const value = wrappedDocumentFixture();
      value.scope.detail = { ...value.scope.detail, [field]: 'foreign' };
      expect(() => qualifyPair(value)).toThrow();
      value.scope.detail = { ...value.scope.detail, [field]: undefined };
      expect(() => qualifyPair(value)).toThrow();
    },
  );
  it.each(['', undefined])('denies a settlement without its original capability ID (%s)', (operationId) => {
    const value = wrappedDocumentFixture();
    value.scope.detail = { ...value.scope.detail, operationId };
    expect(() => qualifyPair(value)).toThrow();
  });
  it.each([
    'detached scope',
    'incomplete scope',
    'ambiguous describe',
    'ambiguous geometry',
    'detached bundle',
    'foreign dependency',
    'missing dependency root',
    'native HIT',
  ])('denies %s without changing IDs, frontiers or native-work guards', (change) => {
    const value = wrappedDocumentFixture();
    switch (change) {
      case 'detached scope': {
        value.scope.detail = { ...value.scope.detail, parentSpanId: '32' };
        break;
      }
      case 'incomplete scope': {
        value.scope.detail = { ...value.scope.detail, generation: undefined };
        break;
      }
      case 'ambiguous describe': {
        value.describeExecute.name = 'kernel.extract-params';
        value.describeExecute.detail = {
          ...value.describeExecute.detail,
          ...value.handler.detail,
          spanId: '25',
          parentSpanId: '24',
        };
        break;
      }
      case 'ambiguous geometry': {
        value.resolver.name = 'middleware.wrap(GeometryCache)';
        break;
      }
      case 'detached bundle': {
        if (value.bundle.detail === undefined) {
          throw new Error('Expected the controlled bundle record.');
        }
        delete value.bundle.detail['parentSpanId'];
        break;
      }
      case 'foreign dependency': {
        value.dependencies.detail = { ...value.dependencies.detail, documentId: 'foreign' };
        break;
      }
      case 'missing dependency root': {
        value.mainAfter = value.mainAfter.filter((entry) => entry !== value.dependencies);
        break;
      }
      case 'native HIT': {
        value.meshBuild.detail = { ...value.meshBuild.detail, source: 'cache' };
        break;
      }
    }
    expect(() => qualifyPair(value)).toThrow();
  });
});

const directAuthoredFixture = () => {
  const value = pairedFixture();
  const internal = value.assemblyAfter.find((entry) => entry.name === 'kernel.evaluate-model');
  if (!internal) {
    throw new Error('Expected the existing evaluated source fixture.');
  }
  internal.detail = { ...internal.detail, file: 'main.ts' };
  const describe = { ...span(29, 'kernel.extract-params', 21), origin: value.expectedPair.root.origin };
  const execute = {
    ...span(30, 'kernel.execute', 29),
    origin: value.expectedPair.root.origin,
    detail: { spanId: '30', parentSpanId: '29', phase: 'computingGeometry' },
  };
  const bundle = {
    ...span(31, 'kernel.bundle', 20),
    origin: value.expectedPair.root.origin,
    detail: { spanId: '31', parentSpanId: '20', entryPath: 'main.ts', phase: 'bundling' },
  };
  value.assemblyAfter = [bundle, execute, describe, ...value.assemblyAfter];
  const digest = value.expectedPair.root.detail?.['digest'];
  const generation = value.expectedPair.root.detail?.['generation'];
  if (typeof digest !== 'string' || typeof generation !== 'number') {
    throw new TypeError('Expected the existing authored publication receipt fixture.');
  }
  const expectedDirect = {
    root: value.expectedPair.root,
    entryPath: 'main.ts',
    kernelId: 'replicad',
    publishedAssembly: {
      digest,
      generation,
      sourceFiles: value.expectedPair.sourceFiles,
      glbDigest: value.expectedPair.glbDigest,
    },
  };
  return { ...value, internal, describe, execute, bundle, expectedDirect };
};

describe('direct authored publication provenance', () => {
  it('admits actual computed publication describe and explicit pre-evaluate bundling only with the exact receipt', () => {
    const value = directAuthoredFixture();
    const graph = selectedPublicationGraph(value.assemblyBefore, value.assemblyAfter, value.expectedDirect);
    expect(graph).toContain(value.assemblyCompute);
    expect(graph).toContain(value.describe);
    expect(graph).toContain(value.execute);
    expect(graph).toContain(value.bundle);
    expect(() =>
      selectedPublicationGraph(value.assemblyBefore, value.assemblyAfter, {
        root: value.expectedPair.root,
        ...expected,
      }),
    ).toThrow('nested producer phase');
  });
  it('should retain the exact authored receipt across valid child and parent batch anchors', () => {
    const value = directAuthoredFixture();
    value.execute.epoch = 1000.125;
    value.expectedPair.root.epoch = 999.875;
    const graph = selectedPublicationGraph(value.assemblyBefore, value.assemblyAfter, value.expectedDirect);
    expect(graph).toContain(value.execute);
    expect(graph).toContain(value.assemblyCompute);
    expect(graph).toContain(value.expectedPair.root);
    expect(() =>
      selectedPublicationGraph(value.assemblyBefore, value.assemblyAfter, {
        root: value.expectedPair.root,
        ...expected,
      }),
    ).toThrow('nested producer phase');
  });
  it.each([
    'detached execute',
    'foreign file',
    'foreign kernel',
    'ambiguous owner',
    'generic bundle',
    'wrong pin',
    'wrong generation',
    'wrong source',
    'wrong output',
    'claimed HIT',
    'missing root',
    'missing parent',
    'lost frontier',
    'foreign origin',
    'invalid anchor',
  ])('denies a direct authored publication with %s', (change) => {
    const value = directAuthoredFixture();
    let failure = 'nested producer phase';
    switch (change) {
      case 'detached execute': {
        value.execute.detail.parentSpanId = '20';
        break;
      }
      case 'foreign file': {
        value.describe.detail = { ...value.describe.detail, entryPath: 'foreign.ts' };
        break;
      }
      case 'foreign kernel': {
        value.describe.detail = { ...value.describe.detail, kernelId: 'foreign-kernel' };
        break;
      }
      case 'ambiguous owner': {
        const second = { ...span(32, 'kernel.evaluate-model', 20), origin: value.expectedPair.root.origin };
        second.detail = { ...second.detail, file: 'main.ts' };
        value.assemblyAfter = [second, ...value.assemblyAfter];
        break;
      }
      case 'generic bundle': {
        value.bundle.detail.entryPath = '';
        break;
      }
      case 'wrong pin': {
        failure = 'exact authored assembly receipt';
        value.expectedDirect.publishedAssembly.digest = `sha256:${'0'.repeat(64)}`;
        break;
      }
      case 'wrong generation': {
        failure = 'exact authored assembly receipt';
        value.expectedDirect.publishedAssembly.generation++;
        break;
      }
      case 'wrong source': {
        failure = 'variant output/source closure';
        value.expectedDirect.publishedAssembly.sourceFiles = {
          ...value.expectedDirect.publishedAssembly.sourceFiles,
          'main.ts': `sha256:${'0'.repeat(64)}`,
        };
        break;
      }
      case 'wrong output': {
        failure = 'variant output/source closure';
        value.expectedDirect.publishedAssembly.glbDigest = `sha256:${'0'.repeat(64)}`;
        break;
      }
      case 'claimed HIT': {
        failure = 'actual cache HIT';
        value.buildHit.detail = { ...value.buildHit.detail, source: 'cache' };
        break;
      }
      case 'missing root': {
        failure = 'root is missing';
        value.assemblyAfter = value.assemblyAfter.filter((entry) => entry !== value.expectedDirect.root);
        break;
      }
      case 'missing parent': {
        failure = 'Truncated';
        value.assemblyAfter = value.assemblyAfter.filter((entry) => entry !== value.describe);
        break;
      }
      case 'lost frontier': {
        failure = 'new captured producer root';
        value.assemblyBefore = [];
        break;
      }
      case 'foreign origin': {
        failure = 'gap';
        value.assemblyAfter = value.assemblyAfter.map((entry) =>
          entry === value.execute ? { ...entry, origin: { label: 'worker', instance: 'foreign-worker' } } : entry,
        );
        break;
      }
      case 'invalid anchor': {
        failure = 'compound producer identity';
        value.assemblyAfter = value.assemblyAfter.map((entry) =>
          entry === value.execute ? { ...entry, epoch: Number.NaN } : entry,
        );
        break;
      }
    }
    expect(() => selectedPublicationGraph(value.assemblyBefore, value.assemblyAfter, value.expectedDirect)).toThrow(
      failure,
    );
  });
});

describe('paired current document and publication provenance', () => {
  it('qualifies distinct actual describe/build/mesh operations and legitimate different publication keys and outputs', () => {
    const value = pairedFixture();
    const result = qualifyPair(value);
    expect(result.main).toContain(value.describeExecute);
    expect(result.main).toContain(value.producer);
    expect(result.main).toContain(value.meshProducer);
    expect(result.assembly).toContain(value.assemblyCompute);
    expect(value.mainMesh.detail?.['dependencyHash']).not.toBe(value.hitMesh.detail?.['dependencyHash']);
    expect(value.mainMesh.detail?.['glbDigest']).not.toBe(value.hitMesh.detail?.['glbDigest']);
    expect(value.meshBuild.detail?.['actionDigest']).not.toBe(value.meshHit.detail?.['actionDigest']);
  });
  it('qualifies a main computed build and mesh with an actual assembly build HIT and computed mesh', () => {
    const value = pairedFixture(false, true);
    const reads = Array.from({ length: 20 }, (_, index) => ({
      ...span(28 + index, 'fs.read'),
      origin: value.expectedPair.root.origin,
    }));
    const captured = capturedPublicationGraph(
      value.assemblyBefore,
      [value.assemblyAfter, reads],
      String(value.expectedPair.root.detail?.['digest']),
    );
    value.assemblyAfter = [...captured.entries];
    const graphs = qualifyPair(value);
    expect(graphs.main).toContain(value.producer);
    expect(graphs.main).toContain(value.meshProducer);
    expect(graphs.assembly).toContain(value.buildHit);
    expect(graphs.assembly.some((entry) => entry.name === 'kernel.compute')).toBe(false);
    expect(graphs.assembly.some((entry) => entry.name === 'kernel.mesh-compute')).toBe(true);
    value.expectedPair.main = { ...value.expectedPair.main, requestId: 'another-request' };
    expect(() => qualifyPair(value)).toThrow('unique current-request');
  });
  it.each([
    'valid',
    'foreign file',
    'foreign kernel',
    'wrong evaluate file',
    'detached execute',
    'generic bundle',
    'ambiguous owner',
  ])('attributes actual publication describe and pre-evaluate bundle work for %s', (change) => {
    const value = pairedFixture(false, true);
    const internal = value.assemblyAfter.find((entry) => entry.name === 'kernel.evaluate-model');
    if (!internal) {
      throw new Error('Expected the existing actual evaluate owner fixture.');
    }
    internal.detail = { ...internal.detail, file: 'main.ts' };
    const describe = { ...span(28, 'kernel.extract-params', 21), origin: value.expectedPair.root.origin };
    const execute = {
      ...span(29, 'kernel.execute', 28),
      origin: value.expectedPair.root.origin,
      detail: { spanId: '29', parentSpanId: '28', phase: 'computingGeometry' },
    };
    const bundle = {
      ...span(30, 'kernel.bundle', 20),
      origin: value.expectedPair.root.origin,
      detail: { spanId: '30', parentSpanId: '20', entryPath: 'main.ts', phase: 'bundling' },
    };
    value.assemblyAfter = [bundle, execute, describe, ...value.assemblyAfter];
    switch (change) {
      case 'foreign file': {
        describe.detail = { ...describe.detail, entryPath: 'foreign.ts' };
        break;
      }
      case 'foreign kernel': {
        describe.detail = { ...describe.detail, kernelId: 'foreign-kernel' };
        break;
      }
      case 'wrong evaluate file': {
        internal.detail = { ...internal.detail, file: 'src/main.ts' };
        break;
      }
      case 'detached execute': {
        execute.detail.parentSpanId = '20';
        break;
      }
      case 'generic bundle': {
        bundle.detail.entryPath = '';
        break;
      }
      case 'ambiguous owner': {
        const second = { ...span(31, 'kernel.evaluate-model', 20), origin: value.expectedPair.root.origin };
        second.detail = { ...second.detail, file: 'main.ts' };
        value.assemblyAfter = [second, ...value.assemblyAfter];
        break;
      }
      case 'valid': {
        break;
      }
    }
    if (change === 'valid') {
      const graph = qualifyPair(value).assembly;
      expect(graph).toContain(bundle);
      expect(graph).toContain(describe);
      expect(graph).toContain(execute);
    } else {
      expect(() => qualifyPair(value)).toThrow('nested producer phase');
    }
  });
  it('qualifies a parked tuple without a live document and an actually observed publication HIT without forcing cross-route key equality', () => {
    const value = pairedFixture(true);
    value.expectedPair.main = {
      evaluationId: 'e1',
      requestId: 'r1',
      key: value.expectedPair.main.key,
      sourceFiles: value.expectedPair.main.sourceFiles,
    };
    expect(qualifyPair(value).main).toContain(value.mainMesh);
    expect(qualifyPair(value).assembly.some((entry) => entry.name === 'kernel.mesh-compute')).toBe(false);
  });
  it.each(['documentId', 'evaluationId', 'requestId'] as const)(
    'denies an identical output key with a different held %s',
    (field) => {
      const value = pairedFixture();
      value.expectedPair.main = { ...value.expectedPair.main, [field]: 'different' };
      expect(() => qualifyPair(value)).toThrow('unique current-request mesh');
    },
  );
  it('denies memoized later requests without an emitted current-request projection-origin link', () => {
    const value = pairedFixture();
    value.expectedPair.main = { ...value.expectedPair.main, requestId: 'memoized-r2' };
    expect(() => qualifyPair(value)).toThrow('memoized association is unproven');
  });
  it('accepts naturally small closed describe and cached build owners without manufacturing native work', () => {
    const value = pairedFixture();
    value.mainAfter = value.mainAfter.filter(
      (entry) =>
        ![value.describeExecute, value.producer].includes(entry) &&
        !['21', '26'].includes(String(entry.detail?.['spanId'])),
    );
    const retained = value.mainAfter.filter((entry) => Number(entry.detail?.['spanId']) >= 20);
    // Preserve allocation order while leaving a one-span describe and two-span cached build.
    const ids = retained.map((entry) => String(entry.detail?.['spanId'])).sort((a, b) => Number(a) - Number(b));
    const remapped = new Map(ids.map((id, index) => [id, String(20 + index)]));
    for (const entry of retained) {
      const parent = entry.detail?.['parentSpanId'];
      entry.detail = {
        ...entry.detail,
        spanId: remapped.get(String(entry.detail?.['spanId'])),
        ...(typeof parent === 'string' ? { parentSpanId: remapped.get(parent) } : {}),
      };
    }
    value.build.detail = { ...value.build.detail, source: 'cache' };
    expect(qualifyPair(value).main).toContain(value.describe);
    expect(qualifyPair(value).main).not.toContain(value.producer);
  });
  it.each(['operationId', 'subscriptionId'] as const)('denies a misjoined actual render %s', (field) => {
    const value = pairedFixture();
    value.mainMesh.detail = { ...value.mainMesh.detail, [field]: 'different-operation' };
    expect(() => qualifyPair(value)).toThrow('operation identity');
  });
  it('denies a build from another actual document or evaluation even with the same final key and source', () => {
    for (const field of ['documentId', 'evaluationId'] as const) {
      const value = pairedFixture();
      value.producer.detail = { ...value.producer.detail, [field]: 'foreign' };
      expect(() => qualifyPair(value)).toThrow('Foreign document/evaluation');
    }
  });
  it('denies disconnected phases, unknown new work and unfinished/gapped selected operations', () => {
    const detached = pairedFixture();
    detached.describeExecute.detail = { ...detached.describeExecute.detail, parentSpanId: '23' };
    expect(() => qualifyPair(detached)).toThrow();
    const unknown = pairedFixture();
    unknown.mainAfter.push({ ...span(31, 'unknown.work'), origin: { label: 'worker', instance: 'main-worker' } });
    expect(() => qualifyPair(unknown)).toThrow('Unknown or detached');
    const unfinished = pairedFixture();
    unfinished.mainAfter = unfinished.mainAfter.filter((entry) => entry !== unfinished.meshProducer);
    expect(() => qualifyPair(unfinished)).toThrow();
    const gap = pairedFixture();
    gap.meshProducer.detail = { ...gap.meshProducer.detail, spanId: '31' };
    expect(() => qualifyPair(gap)).toThrow('gap');
  });
  it('denies missing roots and non-root-last settlement', () => {
    const missing = pairedFixture();
    missing.mainAfter = missing.mainAfter.filter((entry) => entry !== missing.evaluation);
    expect(() => qualifyPair(missing)).toThrow();
    const reordered = pairedFixture();
    reordered.mainAfter = [reordered.mainMesh, ...reordered.mainAfter.filter((entry) => entry !== reordered.mainMesh)];
    expect(() => qualifyPair(reordered)).toThrow('root-last');
  });
  it('should retain dependency, describe, build, mesh and incidental read ownership across real batch boundaries', () => {
    const value = wrappedDocumentFixture();
    for (const entry of value.mainAfter) {
      const id = Number(entry.detail?.['spanId']);
      if (id >= 20) {
        entry.epoch = id < 26 ? 1000.125 : id < 32 ? 1000.25 : 999.875;
      }
    }
    const mainRead = { ...span(37, 'fs.read'), origin: value.mainMesh.origin, epoch: 1000.5 };
    const assemblyRead = {
      ...span(29, 'fs.read'),
      origin: value.expectedPair.root.origin,
      epoch: 1000.75,
    };
    value.mainAfter.push(mainRead);
    value.assemblyAfter.push(assemblyRead);
    const original = structuredClone(value);
    const graphs = qualifyPair(value);
    expect(graphs.main).toContain(value.dependencies);
    expect(graphs.main).toContain(value.handler);
    expect(graphs.main).toContain(value.producer);
    expect(graphs.main).toContain(value.meshProducer);
    expect(graphs.main).toContain(value.scope);
    expect(graphs.main).not.toContain(mainRead);
    expect(graphs.assembly).not.toContain(assemblyRead);
    expect(value).toEqual(original);
  });
  it.each([
    'missing instance',
    'foreign instance',
    'missing label',
    'foreign label',
    'missing time origin',
    'changed time origin',
    'invalid time origin',
    'missing anchor',
    'invalid anchor',
  ])('should deny a split document graph with %s', (change) => {
    const value = wrappedDocumentFixture();
    const entry = { ...value.dependencies, origin: { ...value.dependencies.origin } };
    value.mainAfter = value.mainAfter.map((record) => (record === value.dependencies ? entry : record));
    switch (change) {
      case 'missing instance': {
        Reflect.deleteProperty(entry.origin, 'instance');
        break;
      }
      case 'foreign instance': {
        entry.origin = { ...entry.origin, instance: 'foreign-worker' };
        break;
      }
      case 'missing label': {
        Reflect.deleteProperty(entry.origin, 'label');
        break;
      }
      case 'foreign label': {
        entry.origin = { ...entry.origin, label: 'utility' };
        break;
      }
      case 'missing time origin': {
        Reflect.deleteProperty(entry, 'workerTimeOrigin');
        break;
      }
      case 'changed time origin': {
        entry.workerTimeOrigin = 2000;
        break;
      }
      case 'invalid time origin': {
        entry.workerTimeOrigin = Number.NaN;
        break;
      }
      case 'missing anchor': {
        Reflect.deleteProperty(entry, 'epoch');
        break;
      }
      case 'invalid anchor': {
        entry.epoch = Number.POSITIVE_INFINITY;
        break;
      }
    }
    expect(() => qualifyPair(value)).toThrow(Error);
  });
  it('denies producer replacement, duplicate tuples and lost closed-frontier history', () => {
    const changed = pairedFixture();
    changed.mainAfter[changed.mainAfter.indexOf(changed.meshProducer)] = {
      ...changed.meshProducer,
      origin: { label: 'worker', instance: 'replacement' },
    };
    expect(() => qualifyPair(changed)).toThrow();
    const duplicate = pairedFixture();
    duplicate.mainAfter.push(duplicate.mainMesh);
    expect(() => qualifyPair(duplicate)).toThrow('unique current-request');
    const frontier = pairedFixture();
    frontier.mainAfter = frontier.mainAfter.filter((entry) => entry !== frontier.mainBefore.at(-1));
    expect(() => qualifyPair(frontier)).toThrow('frontier');
  });
  it.each(['actionDigest', 'contentDigest', 'source', 'publicationStatus'] as const)(
    'denies unsupported per-route %s cache evidence',
    (field) => {
      const value = pairedFixture();
      value.meshBuild.detail = { ...value.meshBuild.detail, [field]: 'unsupported' };
      expect(() => qualifyPair(value)).toThrow('cache action outcome');
    },
  );
  it('denies native work inside a claimed HIT and outside its claimed computed action', () => {
    const hit = pairedFixture();
    hit.meshBuild.detail = { ...hit.meshBuild.detail, source: 'cache' };
    expect(() => qualifyPair(hit)).toThrow('actual cache HIT');
    const detached = pairedFixture();
    detached.assemblyCompute.detail = { ...detached.assemblyCompute.detail, parentSpanId: '20' };
    expect(() => qualifyPair(detached)).toThrow('Incomplete computed geometry cache work');
  });
  it.each(['dependencyHash', 'glbDigest', 'kernelId', 'entryPath', 'fileDependencies'] as const)(
    'denies missing %s output provenance',
    (field) => {
      const value = pairedFixture();
      value.mainMesh.detail = Object.fromEntries(
        Object.entries(value.mainMesh.detail ?? {}).filter(([key]) => key !== field),
      );
      expect(() => qualifyPair(value)).toThrow();
    },
  );
  it('denies changed source/output/pin receipts', () => {
    const source = pairedFixture();
    source.expectedPair.sourceFiles = { ...source.expectedPair.sourceFiles, 'main.ts': `sha256:${'6'.repeat(64)}` };
    expect(() => qualifyPair(source)).toThrow('shared source closure');
    const output = pairedFixture();
    output.hitMesh.detail = { ...output.hitMesh.detail, glbDigest: `sha256:${'6'.repeat(64)}` };
    expect(() => qualifyPair(output)).toThrow('variant output/source');
    const pin = pairedFixture();
    pin.expectedPair.root.detail = { ...pin.expectedPair.root.detail, generation: 0 };
    expect(() => qualifyPair(pin)).toThrow('current receipt');
  });
  it.each(['main', 'assembly'] as const)('denies the original 2000-entry ceiling for %s', (owner) => {
    const value = pairedFixture();
    if (owner === 'main') {
      value.mainAfter = Array.from({ length: 2000 }, () => value.mainMesh);
    } else {
      value.assemblyAfter = Array.from({ length: 2000 }, () => value.hitMesh);
    }
    expect(() => qualifyPair(value)).toThrow('entry ceiling');
  });
});

const displayedFixture = ({
  sameOutput = false,
  hit = false,
}: Readonly<{ sameOutput?: boolean; hit?: boolean }> = {}) => {
  const value = pairedFixture();
  const displayedDocument: Parameters<typeof pairedPublicationGraphs>[1]['main'] = {
    ...value.expectedPair.main,
    documentId: 'captured-document',
    requestId: 'actual-pane-request',
    key: sameOutput ? value.expectedPair.main.key : '5'.repeat(64),
  };
  const operation = {
    documentId: displayedDocument.documentId,
    evaluationId: displayedDocument.evaluationId,
    requestId: displayedDocument.requestId,
    subscriptionId: 'actual-pane-view',
    operationId: 'render:actual-pane-view:e1:actual-pane-request',
  };
  const paneSpan = (id: number, name: string, parent?: number): TelemetrySpanRecord => ({
    ...span(id, name, parent),
    origin: { label: 'worker', instance: 'main-worker' },
    detail: { ...span(id, name, parent).detail, ...operation },
  });
  const mesh = paneSpan(31, 'kernel.mesh');
  mesh.detail = {
    ...mesh.detail,
    dependencyHash: displayedDocument.key,
    fileDependencies: value.mainMesh.detail?.['fileDependencies'],
    glbDigest: value.mainMesh.detail?.['glbDigest'],
  };
  const wrapper = paneSpan(32, 'middleware.wrap(GeometryCache)', 31);
  const cache = paneSpan(33, 'cache.geometry.mesh.evaluate', 32);
  cache.detail = {
    ...cache.detail,
    source: hit ? 'cache' : 'computed',
    ...(hit ? {} : { publicationStatus: 'stored' }),
    actionDigest: `sha256:${'6'.repeat(64)}`,
    contentDigest: `sha256:${'7'.repeat(64)}`,
  };
  const compute = paneSpan(34, 'kernel.mesh-compute', 33);
  const entries = [...value.mainAfter, ...(hit ? [] : [compute]), cache, wrapper, mesh];
  return { value, displayedDocument, mesh, wrapper, cache, compute, entries };
};
const qualifyDisplayed = (fixture: ReturnType<typeof displayedFixture>) =>
  selectedPublicationGraph(fixture.value.mainBefore, fixture.entries, {
    document: fixture.value.expectedPair.main,
    displayedDocument: fixture.displayedDocument,
    ...expected,
  });

describe('actual default and displayed document operations', () => {
  it.each([false, true])(
    'should account distinct pane requests with same output=%s and count shared build and describe work once',
    (sameOutput) => {
      const fixture = displayedFixture({ sameOutput });
      const graph = qualifyDisplayed(fixture);
      expect(graph).toContain(fixture.value.mainMesh);
      expect(graph).toContain(fixture.mesh);
      expect(graph.filter((entry) => entry === fixture.value.evaluation)).toHaveLength(1);
      expect(graph.filter((entry) => entry === fixture.value.describe)).toHaveLength(1);
      expect(graph.filter((entry) => entry === fixture.value.producer)).toHaveLength(1);
      expect(graph.filter((entry) => entry.name === 'kernel.mesh-compute')).toHaveLength(2);
      expect(fixture.mesh.detail?.['requestId']).not.toBe(fixture.value.mainMesh.detail?.['requestId']);
    },
  );
  it('should retain the exact assembly receipt while accounting default and displayed main operations', () => {
    const fixture = displayedFixture();
    const pair = pairedPublicationGraphs(
      {
        assemblyBefore: fixture.value.assemblyBefore,
        assemblyAfter: fixture.value.assemblyAfter,
        mainBefore: fixture.value.mainBefore,
        mainAfter: fixture.entries,
      },
      { ...fixture.value.expectedPair, displayedDocument: fixture.displayedDocument },
    );
    expect(pair.main).toEqual(qualifyDisplayed(fixture));
    expect(pair.assembly).toContain(fixture.value.expectedPair.root);
    expect(pair.main.filter((entry) => entry === fixture.value.producer)).toHaveLength(1);
  });
  it('should account an actual pane mesh HIT without changing either legitimate action key', () => {
    const fixture = displayedFixture({ hit: true });
    const graph = qualifyDisplayed(fixture);
    expect(graph).toContain(fixture.mesh);
    expect(graph).toContain(fixture.cache);
    expect(graph).not.toContain(fixture.compute);
    expect(fixture.cache.detail?.['actionDigest']).not.toBe(fixture.value.meshBuild.detail?.['actionDigest']);
  });
  it.each(['documentId', 'evaluationId', 'requestId'] as const)(
    'should deny identical output with a changed displayed %s',
    (field) => {
      const fixture = displayedFixture({ sameOutput: true });
      fixture.displayedDocument = { ...fixture.displayedDocument, [field]: 'foreign' };
      expect(() => qualifyDisplayed(fixture)).toThrow();
    },
  );
  it('should deny absent or mismatched pane source closure despite unchanged request and output IDs', () => {
    const changed = displayedFixture({ sameOutput: true });
    changed.displayedDocument = {
      ...changed.displayedDocument,
      sourceFiles: { ...changed.displayedDocument.sourceFiles, 'main.ts': `sha256:${'4'.repeat(64)}` },
    };
    expect(() => qualifyDisplayed(changed)).toThrow('source closure');
    const missing = displayedFixture();
    missing.displayedDocument = { ...missing.displayedDocument, sourceFiles: {} };
    expect(() => qualifyDisplayed(missing)).toThrow('source closure');
  });
  it('should retain distinct displayed requests across valid batch anchors without changing their source or output', () => {
    const fixture = displayedFixture();
    const mesh = { ...fixture.mesh, epoch: 1000.125 };
    const wrapper = { ...fixture.wrapper, epoch: 1000.125 };
    const cache = { ...fixture.cache, epoch: 1000.125 };
    const compute = { ...fixture.compute, epoch: 1000.125 };
    const replacements = new Map([
      [fixture.mesh, mesh],
      [fixture.wrapper, wrapper],
      [fixture.cache, cache],
      [fixture.compute, compute],
    ]);
    const graph = qualifyDisplayed({
      ...fixture,
      mesh,
      wrapper,
      cache,
      compute,
      entries: fixture.entries.map((entry) => replacements.get(entry) ?? entry),
    });
    expect(graph).toContain(fixture.value.mainMesh);
    expect(graph).toContain(mesh);
    expect(graph).toContain(compute);
    expect(fixture.value.mainMesh.epoch).toBe(1000);
    expect(mesh.epoch).toBe(1000.125);
  });
  it.each(['invalid anchor', 'workerTimeOrigin', 'origin'] as const)(
    'should deny a displayed mesh from a changed %s',
    (field) => {
      const fixture = displayedFixture();
      const replacement = {
        ...fixture.mesh,
        ...(field === 'origin'
          ? { origin: { label: 'worker', instance: 'foreign' } }
          : field === 'invalid anchor'
            ? { epoch: Number.NaN }
            : { workerTimeOrigin: 2000 }),
      };
      fixture.entries[fixture.entries.indexOf(fixture.mesh)] = replacement;
      expect(() => qualifyDisplayed(fixture)).toThrow();
    },
  );
  it('should deny memoized pane requests without actual current-request mesh and extra pane work without its held tuple', () => {
    const memoized = displayedFixture();
    memoized.displayedDocument = { ...memoized.displayedDocument, requestId: 'later-memoized-request' };
    expect(() => qualifyDisplayed(memoized)).toThrow('memoized association is unproven');
    const omitted = displayedFixture();
    expect(() =>
      selectedPublicationGraph(omitted.value.mainBefore, omitted.entries, {
        document: omitted.value.expectedPair.main,
        ...expected,
      }),
    ).toThrow('Unknown or detached');
  });
  it('should deny disconnected, missing, unfinished, root-first and gapped pane operations', () => {
    const disconnected = displayedFixture();
    disconnected.wrapper.detail = { ...disconnected.wrapper.detail, parentSpanId: '27' };
    expect(() => qualifyDisplayed(disconnected)).toThrow();
    const missing = displayedFixture();
    missing.entries = missing.entries.filter((entry) => entry !== missing.mesh);
    expect(() => qualifyDisplayed(missing)).toThrow();
    const unfinished = displayedFixture();
    unfinished.entries = unfinished.entries.filter((entry) => entry !== unfinished.compute);
    expect(() => qualifyDisplayed(unfinished)).toThrow('Incomplete computed geometry cache work');
    const rootFirst = displayedFixture();
    rootFirst.entries = [rootFirst.mesh, ...rootFirst.entries.filter((entry) => entry !== rootFirst.mesh)];
    expect(() => qualifyDisplayed(rootFirst)).toThrow('root-last');
    const gap = displayedFixture();
    gap.compute.detail = { ...gap.compute.detail, spanId: '35' };
    expect(() => qualifyDisplayed(gap)).toThrow('gap');
  });
  it('should deny a computed build without its actual handler span and preserve computed parameter actions', () => {
    const build = pairedFixture();
    build.mainAfter = build.mainAfter.filter((entry) => entry !== build.producer && entry.detail?.['spanId'] !== '26');
    expect(() => qualifyPair(build)).toThrow('Incomplete computed geometry cache work');
    const parameter = pairedFixture();
    parameter.describe.name = 'middleware.wrap(ParameterCache)';
    const action = parameter.mainAfter.find((entry) => entry.detail?.['spanId'] === '21');
    if (!action) {
      throw new Error('Expected the actual parameter action fixture.');
    }
    action.name = 'cache.parameter.evaluate';
    action.detail = {
      ...action.detail,
      source: 'computed',
      publicationStatus: 'stored',
      actionDigest: `sha256:${'1'.repeat(64)}`,
      contentDigest: `sha256:${'2'.repeat(64)}`,
    };
    parameter.describeExecute.name = 'kernel.extract-params';
    parameter.describeExecute.detail = {
      ...parameter.describe.detail,
      spanId: '22',
      parentSpanId: '21',
    };
    const graph = qualifyPair(parameter).main;
    expect(graph).toContain(action);
    expect(graph.filter((entry) => entry.name === 'kernel.compute')).toEqual([parameter.producer]);
  });
  it('should deny conflicting outputs attributed to one actual request', () => {
    const fixture = displayedFixture();
    fixture.displayedDocument = { ...fixture.displayedDocument, requestId: fixture.value.expectedPair.main.requestId };
    expect(() => qualifyDisplayed(fixture)).toThrow('conflicting output');
  });
});

const preparedDocumentFixture = () => {
  const value = wrappedDocumentFixture();
  // Preserve the existing complete interval, inserting the observed regex-selection topology before dependencies.
  for (const entry of value.mainAfter) {
    const id = Number(entry.detail?.['spanId']);
    if (id < 20) {
      continue;
    }
    const parent = entry.detail?.['parentSpanId'];
    entry.detail = {
      ...entry.detail,
      spanId: String(id + 11 + (id >= 32 ? 1 : 0)),
      ...(typeof parent === 'string'
        ? { parentSpanId: String(Number(parent) + 11 + (Number(parent) >= 32 ? 1 : 0)) }
        : {}),
    };
  }
  const { origin } = value.mainMesh;
  const selection: TelemetrySpanRecord = {
    ...span(20, 'kernel.select'),
    origin,
    detail: { spanId: '20', file: 'main.ts', kernelId: 'replicad', method: 'regex' },
  };
  const detections: TelemetrySpanRecord[] = ['opencascade', 'jscad', 'manifold', 'picovoxel', 'replicad'].map(
    (kernel, index) => ({
      ...span(21 + index * 2, 'kernel.detect-import', 20),
      origin,
      detail: { spanId: String(21 + index * 2), parentSpanId: '20', kernel },
    }),
  );
  const reads: TelemetrySpanRecord[] = detections.map((entry) => {
    const id = entry.detail?.['spanId'];
    if (typeof id !== 'string') {
      throw new TypeError('Expected the captured detection identity.');
    }
    return {
      ...span(Number(id) + 1, 'fs.read', Number(id)),
      origin,
      detail: { spanId: String(Number(id) + 1), parentSpanId: id, path: 'main.ts' },
    };
  });
  const hash: TelemetrySpanRecord = {
    ...span(43, 'deps.content-hash'),
    origin,
    detail: {
      spanId: '43',
      documentId: 'captured-document',
      evaluationId: 'e1',
      operationId: 'render:captured-view:e1:r1',
      subscriptionId: 'captured-view',
      requestId: 'r1',
      entryPath: 'main.ts',
      kernelId: 'replicad',
      dependencyHash: '6'.repeat(64),
    },
  };
  value.mainAfter = [
    ...value.mainAfter.filter((entry) => Number(entry.detail?.['spanId']) < 20),
    ...detections.flatMap((entry, index) => {
      const read = reads.at(index);
      if (!read) {
        throw new Error('Expected the detection-owned filesystem read.');
      }
      return [read, entry];
    }),
    selection,
    ...value.mainAfter.filter(
      (entry) => Number(entry.detail?.['spanId']) >= 31 && Number(entry.detail?.['spanId']) < 44,
    ),
    hash,
    ...value.mainAfter.filter((entry) => Number(entry.detail?.['spanId']) >= 44),
  ];
  return { ...value, selection, detections, reads, hash };
};

describe('actual closed regex preparation and render dependency hashing', () => {
  it('should count the complete selection preparation and exact render-owned dependency digest without treating it as output', () => {
    const value = preparedDocumentFixture();
    const original = structuredClone(value);
    const graph = qualifyPair(value).main;
    expect(graph).toContain(value.selection);
    expect(graph.filter((entry) => entry.name === 'kernel.detect-import')).toHaveLength(5);
    expect(graph).toContain(value.hash);
    expect(value.hash.detail?.['dependencyHash']).not.toBe(value.expectedPair.main.key);
    expect(value).toEqual(original);
  });
  it.each(['kernel.initialize', 'kernel.bundle', 'kernel.compute', 'kernel.detect-bundle', 'extra read'])(
    'should deny %s inside selection preparation',
    (name) => {
      const value = preparedDocumentFixture();
      const detection = value.detections.at(0);
      if (!detection) {
        throw new Error('Expected actual regex detection.');
      }
      detection.name = name === 'extra read' ? 'fs.read' : name;
      expect(() => qualifyPair(value)).toThrow('selection preparation');
    },
  );
  it.each([
    'foreign file',
    'foreign selected kernel',
    'wrong method',
    'detached read',
    'missing read',
    'duplicate selection',
    'foreign origin',
    'future selection',
  ])('should deny %s for the captured preparation', (change) => {
    const value = preparedDocumentFixture();
    const read = value.reads.at(0);
    if (!read) {
      throw new Error('Expected actual selection read.');
    }
    switch (change) {
      case 'foreign file': {
        read.detail = { ...read.detail, path: 'foreign.ts' };
        break;
      }
      case 'foreign selected kernel': {
        value.selection.detail = { ...value.selection.detail, kernelId: 'jscad' };
        break;
      }
      case 'wrong method': {
        value.selection.detail = { ...value.selection.detail, method: 'bundle' };
        break;
      }
      case 'detached read': {
        read.detail = { ...read.detail, parentSpanId: undefined };
        break;
      }
      case 'missing read': {
        value.mainAfter = value.mainAfter.filter((entry) => entry !== read);
        break;
      }
      case 'duplicate selection': {
        value.mainAfter.push({ ...value.selection });
        break;
      }
      case 'foreign origin': {
        value.mainAfter[value.mainAfter.indexOf(read)] = { ...read, origin: { label: 'worker', instance: 'foreign' } };
        break;
      }
      case 'future selection': {
        for (const entry of [value.selection, ...value.detections, ...value.reads]) {
          const parent = entry.detail?.['parentSpanId'];
          entry.detail = {
            ...entry.detail,
            spanId: String(Number(entry.detail?.['spanId']) + 29),
            ...(typeof parent === 'string' ? { parentSpanId: String(Number(parent) + 29) } : {}),
          };
        }
        break;
      }
    }
    expect(() => qualifyPair(value)).toThrow();
  });
  it.each([
    'documentId',
    'evaluationId',
    'operationId',
    'subscriptionId',
    'requestId',
    'entryPath',
    'kernelId',
    'dependencyHash',
  ])('should deny missing or foreign %s on the render hash', (field) => {
    for (const value of [undefined, 'foreign']) {
      const fixture = preparedDocumentFixture();
      fixture.hash.detail = { ...fixture.hash.detail, [field]: value };
      expect(() => qualifyPair(fixture)).toThrow();
    }
  });
  it.each(['detached request', 'foreign origin', 'nested hash', 'unknown child', 'duplicate hash', 'future hash'])(
    'should deny %s on the real hash owner',
    (change) => {
      const value = preparedDocumentFixture();
      switch (change) {
        case 'detached request': {
          value.hash.detail = { spanId: '43', dependencyHash: '6'.repeat(64) };
          break;
        }
        case 'foreign origin': {
          value.mainAfter[value.mainAfter.indexOf(value.hash)] = {
            ...value.hash,
            origin: { label: 'worker', instance: 'foreign' },
          };
          break;
        }
        case 'nested hash': {
          value.hash.detail = { ...value.hash.detail, parentSpanId: value.evaluation.detail?.['spanId'] };
          break;
        }
        case 'unknown child': {
          for (const entry of value.mainAfter) {
            if (Number(entry.detail?.['spanId']) < 44) {
              continue;
            }
            const parent = entry.detail?.['parentSpanId'];
            entry.detail = {
              ...entry.detail,
              spanId: String(Number(entry.detail?.['spanId']) + 1),
              ...(typeof parent === 'string'
                ? { parentSpanId: String(Number(parent) >= 44 ? Number(parent) + 1 : Number(parent)) }
                : {}),
            };
          }
          value.mainAfter.splice(value.mainAfter.indexOf(value.hash), 0, {
            ...span(44, 'kernel.initialize', 43),
            origin: value.hash.origin,
          });
          break;
        }
        case 'duplicate hash': {
          value.mainAfter.push({ ...value.hash });
          break;
        }
        case 'future hash': {
          value.hash.detail = { ...value.hash.detail, spanId: '49' };
          break;
        }
      }
      expect(() => qualifyPair(value)).toThrow();
    },
  );
});

const peerPreparedDocumentFixture = () => {
  const value = preparedDocumentFixture();
  const peerPreparation = { ...value.expectedPair.main, requestId: 'peer-r1' };
  const peerHash: TelemetrySpanRecord = {
    ...span(49, 'deps.content-hash'),
    origin: value.hash.origin,
    detail: {
      spanId: '49',
      documentId: peerPreparation.documentId,
      evaluationId: peerPreparation.evaluationId,
      operationId: 'render:peer-view:e1:peer-r1',
      subscriptionId: 'peer-view',
      requestId: peerPreparation.requestId,
      entryPath: 'main.ts',
      kernelId: 'replicad',
      dependencyHash: value.hash.detail?.['dependencyHash'],
    },
  };
  value.mainAfter.push(peerHash);
  return { ...value, peerPreparation, peerHash };
};
const qualifyPeerPreparation = (value: ReturnType<typeof peerPreparedDocumentFixture>) =>
  selectedPublicationGraph(value.mainBefore, value.mainAfter, {
    ...expected,
    document: value.expectedPair.main,
    peerPreparation: value.peerPreparation,
  });

describe('singleton current peer render preparation', () => {
  it('should count the exact peer dependency preparation separately without attributing a peer mesh', () => {
    const value = peerPreparedDocumentFixture();
    const original = structuredClone(value);
    const graph = qualifyPeerPreparation(value);
    expect(graph.filter((entry) => entry.detail?.['requestId'] === value.peerPreparation.requestId)).toEqual([
      value.peerHash,
    ]);
    expect(graph.filter((entry) => entry.name === 'deps.content-hash')).toHaveLength(2);
    expect(graph.filter((entry) => entry.name === 'kernel.mesh')).toEqual([value.mainMesh]);
    expect(value.peerHash.detail?.['dependencyHash']).toBe(value.hash.detail?.['dependencyHash']);
    expect(value.peerHash.detail?.['dependencyHash']).not.toBe(value.peerPreparation.key);
    expect(value).toEqual(original);
  });

  it('should retain missing peer preparation and memoized displayed-mesh denials', () => {
    const value = peerPreparedDocumentFixture();
    expect(() =>
      selectedPublicationGraph(value.mainBefore, value.mainAfter, {
        ...expected,
        document: value.expectedPair.main,
      }),
    ).toThrow('Unknown or detached');
    expect(() =>
      selectedPublicationGraph(value.mainBefore, value.mainAfter, {
        ...expected,
        document: value.expectedPair.main,
        displayedDocument: value.peerPreparation,
      }),
    ).toThrow('memoized association is unproven');
  });

  it.each(['documentId', 'evaluationId', 'requestId', 'key'])(
    'should deny a missing or foreign held peer %s',
    (field) => {
      for (const replacement of ['', 'foreign']) {
        const value = peerPreparedDocumentFixture();
        value.peerPreparation = { ...value.peerPreparation, [field]: replacement };
        expect(() => qualifyPeerPreparation(value)).toThrow();
      }
    },
  );
  it('should deny a held peer with different source bytes or the default request', () => {
    const value = peerPreparedDocumentFixture();
    value.peerPreparation = {
      ...value.peerPreparation,
      sourceFiles: { ...value.peerPreparation.sourceFiles, 'main.ts': `sha256:${'9'.repeat(64)}` },
    };
    expect(() => qualifyPeerPreparation(value)).toThrow('source/output closure');
    const sameRequest = peerPreparedDocumentFixture();
    sameRequest.peerPreparation = {
      ...sameRequest.peerPreparation,
      requestId: sameRequest.expectedPair.main.requestId,
    };
    expect(() => qualifyPeerPreparation(sameRequest)).toThrow();
  });

  it.each([
    'documentId',
    'evaluationId',
    'operationId',
    'subscriptionId',
    'requestId',
    'entryPath',
    'kernelId',
    'dependencyHash',
  ])('should deny missing or foreign peer hash %s', (field) => {
    for (const replacement of [undefined, 'foreign']) {
      const value = peerPreparedDocumentFixture();
      value.peerHash.detail = { ...value.peerHash.detail, [field]: replacement };
      expect(() => qualifyPeerPreparation(value)).toThrow();
    }
  });
  it.each([
    'missing origin',
    'foreign origin',
    'missing label',
    'foreign label',
    'missing time origin',
    'changed time origin',
    'missing anchor',
    'invalid anchor',
  ])('should deny %s on the peer owner', (change) => {
    const value = peerPreparedDocumentFixture();
    let peer = value.peerHash;
    switch (change) {
      case 'missing origin': {
        peer = { ...peer, origin: { ...peer.origin, instance: '' } };
        break;
      }
      case 'foreign origin': {
        peer = { ...peer, origin: { ...peer.origin, instance: 'foreign' } };
        break;
      }
      case 'missing label': {
        peer = { ...peer, origin: { ...peer.origin, label: '' } };
        break;
      }
      case 'foreign label': {
        peer = { ...peer, origin: { ...peer.origin, label: 'foreign' } };
        break;
      }
      case 'missing time origin': {
        peer = { ...peer };
        Reflect.deleteProperty(peer, 'workerTimeOrigin');
        break;
      }
      case 'changed time origin': {
        peer = { ...peer, workerTimeOrigin: 1001 };
        break;
      }
      case 'missing anchor': {
        peer = { ...peer };
        Reflect.deleteProperty(peer, 'epoch');
        break;
      }
      case 'invalid anchor': {
        peer = { ...peer, epoch: Number.NaN };
        break;
      }
    }
    value.mainAfter[value.mainAfter.indexOf(value.peerHash)] = peer;
    expect(() => qualifyPeerPreparation(value)).toThrow();
  });
  it.each([
    'duplicate',
    'missing peer',
    'missing default hash',
    'nested',
    'same subscription',
    'different valid digest',
    'missing frontier',
  ])('should deny %s in the closed peer preparation', (change) => {
    const value = peerPreparedDocumentFixture();
    switch (change) {
      case 'duplicate': {
        value.mainAfter.push({ ...value.peerHash });
        break;
      }
      case 'missing peer': {
        value.mainAfter = value.mainAfter.filter((entry) => entry !== value.peerHash);
        break;
      }
      case 'missing default hash': {
        value.mainAfter = value.mainAfter.filter((entry) => entry !== value.hash);
        break;
      }
      case 'nested': {
        value.peerHash.detail = { ...value.peerHash.detail, parentSpanId: value.mainMesh.detail?.['spanId'] };
        break;
      }
      case 'same subscription': {
        value.peerHash.detail = {
          ...value.peerHash.detail,
          subscriptionId: 'captured-view',
          operationId: 'render:captured-view:e1:peer-r1',
        };
        break;
      }
      case 'different valid digest': {
        value.peerHash.detail = { ...value.peerHash.detail, dependencyHash: '7'.repeat(64) };
        break;
      }
      case 'missing frontier': {
        value.mainAfter = value.mainAfter.filter((entry) => Number(entry.detail?.['spanId']) !== 19);
        break;
      }
    }
    expect(() => qualifyPeerPreparation(value)).toThrow();
  });
  it.each([
    'fs.read',
    'deps.content-hash',
    'kernel.initialize',
    'kernel.compute',
    'kernel.mesh',
    'kernel.mesh-compute',
    'kernel.bundle',
    'unknown.phase',
  ])('should deny an extra %s descendant inside the singleton preparation', (name) => {
    const value = peerPreparedDocumentFixture();
    value.mainAfter.splice(value.mainAfter.indexOf(value.peerHash), 0, {
      ...span(50, name, 49),
      origin: value.peerHash.origin,
    });
    expect(() => qualifyPeerPreparation(value)).toThrow();
  });
  it('should deny detached peer work and an unknown independent phase', () => {
    const value = peerPreparedDocumentFixture();
    value.mainAfter.push({ ...span(50, 'kernel.mesh'), origin: value.peerHash.origin });
    expect(() => qualifyPeerPreparation(value)).toThrow('Unknown or detached');
    const unknown = peerPreparedDocumentFixture();
    unknown.mainAfter.push({ ...span(50, 'unknown.phase'), origin: unknown.peerHash.origin });
    expect(() => qualifyPeerPreparation(unknown)).toThrow('Unknown or detached');
  });
});
