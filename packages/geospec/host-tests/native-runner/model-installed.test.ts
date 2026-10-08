import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeDocument } from '@taucad/runtime/client';
import type {
  GeoSpecAssertionClient,
  GeoSpecCanonicalClaimReport,
  GeoSpecNativeSubject,
} from 'geospec/assertion-client';
import { runGeoSpecModule } from 'geospec/runner';
import type { GeoSpecAssertion } from 'geospec/runner';
import { createNativeGeoSpecRunner } from 'geospec/runner/native';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';
import type { GeoSpecRunnerEvent } from 'geospec/runner/worker';
import type { GeoSpecRuntimeClient, RuntimeClientWithRoutes } from 'geospec/model';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { createModelLoader } from '#model/load-model.js';
import { expectGeo } from 'geospec';
import { rawSubjectResidency } from '#model/subject.js';

type NativeModule = {
  Engine: new () => GeoSpecNativeModelEngine & { close?: () => void; observations(): Uint8Array<ArrayBuffer> };
  initialize?: () => Promise<void>;
};
type InstalledClientModule = {
  createGeoSpecAssertionClient(options: {
    engine: GeoSpecNativeModelEngine;
    claimId: () => string;
    workUnitLimit: number;
  }): GeoSpecAssertionClient;
};

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('.', import.meta.url));
const entryPath = 'model.geospec.ts';
const installedRoot = process.env['GEOSPEC_INSTALLED_CONSUMER_ROOT'];
if (!installedRoot) {
  throw new Error('GEOSPEC_INSTALLED_CONSUMER_ROOT must select the current prepared installed consumer.');
}
const stepPath = resolve(
  root,
  'packages/geospec/host-tests/fixtures/data/5e97ff394bd8fd15318efa6b0345fcbdc7c80b4c6d30b8ad87a84b6cade19305',
);
const glbPath = resolve(
  root,
  'packages/geospec/host-tests/fixtures/data/1321806f5b10c87126bece80cee96cf867c6c131db655a9f28558a39a086616d',
);
const routes = [
  { name: 'current native', entry: 'node' },
  { name: 'current mixed', entry: 'wasm' },
] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const protocolHeader = { canonicalProfile: 'geospec-jcs-v1', protocolVersion: 3, registryVersion: 5 } as const;

async function readFixture(path: string): Promise<Uint8Array<ArrayBuffer>>;
async function readFixture(path: string, encoding: 'utf8'): Promise<string>;
async function readFixture(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
  const bytes = await readFile(resolve(fixtureRoot, path));
  return encoding === 'utf8' ? bytes.toString('utf8') : new Uint8Array(bytes);
}

const filesystem: VmFileSystem = {
  async exists(path) {
    try {
      await access(resolve(fixtureRoot, path));
      return true;
    } catch {
      return false;
    }
  },
  readFile: readFixture,
  async writeFile() {
    throw new Error('This acceptance filesystem is read-only.');
  },
  async ensureDir() {
    throw new Error('This acceptance filesystem is read-only.');
  },
};

const encode = (value: unknown): Uint8Array<ArrayBuffer> => encoder.encode(JSON.stringify(value));

const admission = (
  engine: GeoSpecNativeModelEngine,
  options: { bytes: Uint8Array<ArrayBuffer>; format: 'glb' | 'step'; sourceUnit: 'auto' | 'mm'; requestId: string },
) => {
  const response = JSON.parse(
    decoder.decode(
      engine.ingestSubject(
        encode({
          ...protocolHeader,
          method: 'ingestSubject',
          requestId: options.requestId,
          format: options.format,
          frame: { coordinateSystem: 'z-up', sourceUnit: options.sourceUnit, outputUnit: 'mm' },
          ingestOptions: {},
          primaryByteLength: options.bytes.byteLength,
          resources: [],
        }),
        options.bytes,
        [],
      ),
    ),
  ) as { result: { subject: { subjectHash: string } } };
  const subject = { subjectHash: response.result.subject.subjectHash };
  const handle = JSON.parse(
    decoder.decode(
      engine.subjectHandle(
        encode({
          ...protocolHeader,
          method: 'subjectHandle',
          requestId: `${options.requestId}:handle`,
          ...subject,
        }),
      ),
    ),
  ) as { result: { subjectHandle: unknown } };
  return { subject, handle: handle.result.subjectHandle };
};

const release = (engine: GeoSpecNativeModelEngine, requestId: string, subjectHandle: unknown): void => {
  engine.releaseSubject(encode({ ...protocolHeader, method: 'releaseSubject', requestId, subjectHandle }));
};

const evaluateReference = async (
  client: GeoSpecAssertionClient,
  assertion: GeoSpecAssertion,
): Promise<GeoSpecCanonicalClaimReport> => {
  const chain = client.expectGeo(assertion.subject as GeoSpecNativeSubject);
  switch (assertion.kind) {
    case 'volume': {
      return chain.toHaveVolume(assertion.expected as Parameters<typeof chain.toHaveVolume>[0]);
    }
    case 'boundingBox': {
      return chain.toHaveBoundingBox(assertion.expected as Parameters<typeof chain.toHaveBoundingBox>[0]);
    }
    case 'validBrep': {
      return chain.toBeValidBrep(assertion.expected as Parameters<typeof chain.toBeValidBrep>[0]);
    }
    case 'watertight': {
      return chain.toBeWatertight();
    }
    default: {
      throw new Error(`Unexpected native model assertion: ${assertion.kind}`);
    }
  }
};

const serializableReport = (report: GeoSpecCanonicalClaimReport) => ({
  canonicalClaimUtf8: decoder.decode(report.canonicalClaim),
  canonicalPlanUtf8: decoder.decode(report.canonicalPlan),
  canonicalResultUtf8: decoder.decode(report.canonicalResult),
  claim: report.claim,
  claimId: report.claimId,
  diagnostics: report.diagnostics,
  evidence: report.evidence,
  polarity: report.polarity,
  result: report.result,
  status: report.status,
});

describe('canonical authoring admission', () => {
  it.each(['malformed', 'mismatch', 'handle-query', 'handle-decode'] as const)(
    'should release an actual restored allocation after %s failure and preserve unrelated residency',
    async (fault) => {
      const modulePath = resolve(installedRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
      const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
      const inner = new native.Engine();
      let corrupt = false;
      let ingests = 0;
      const engine: GeoSpecNativeModelEngine = {
        processRequest: (request) => inner.processRequest(request),
        evaluateClaim: (request) => inner.evaluateClaim(request),
        subjectHandle: (request) => {
          if (corrupt && fault === 'handle-query') {
            throw new Error('Selected handle query is temporarily unavailable.');
          }
          if (corrupt && fault === 'handle-decode') {
            return Uint8Array.of(123);
          }
          return inner.subjectHandle(request);
        },
        releaseSubject: (request) => inner.releaseSubject(request),
        ingestSubject(request, primary, resources) {
          ingests += 1;
          const response = inner.ingestSubject(request, primary, resources);
          if (corrupt && fault === 'malformed') {
            return Uint8Array.of(123);
          }
          if (corrupt && fault === 'mismatch') {
            return encode({ result: { subject: foreign.subject } });
          }
          return response;
        },
      };
      const loader = createGeoSpecNativeModelLoader({ engine });
      const source = new Uint8Array(await readFile(stepPath));
      const foreign = admission(inner, {
        bytes: source,
        format: 'step',
        sourceUnit: 'auto',
        requestId: 'rollback-foreign',
      });
      try {
        const first = await loader({ source, format: 'step', ingestOptions: { name: 'rollback-first' } });
        for (let index = 0; index < 32; index += 1) {
          // oxlint-disable-next-line no-await-in-loop -- Evict the first subject using the unchanged actual native count limit.
          await loader({ source, format: 'step', ingestOptions: { name: `rollback-${index}` } });
        }
        corrupt = true;
        const restore = rawSubjectResidency(first)!;
        const expectedHandle = () =>
          inner.subjectHandle(
            encode({
              ...protocolHeader,
              method: 'subjectHandle',
              requestId: 'rollback-absent',
              subjectHash: first.subjectHash,
            }),
          );
        if (fault === 'handle-query' || fault === 'handle-decode') {
          expect(restore).toThrow(AggregateError);
          expect(restore).toThrow('Native GeoSpec restored admission failed and cleanup remains pending.');
          const beforeBlockedLoad = ingests;
          await expect(loader({ source, format: 'step', ingestOptions: { name: 'blocked-pending' } })).rejects.toThrow(
            AggregateError,
          );
          expect(ingests).toBe(beforeBlockedLoad);
          expect(JSON.parse(decoder.decode(expectedHandle()))).toMatchObject({
            result: { subjectHandle: { subjectHash: first.subjectHash } },
          });
          await expect(loader.releaseAll()).rejects.toThrow(AggregateError);
          expect(restore).toThrow('not admitted');
          corrupt = false;
          await loader.releaseAll();
          expect(expectedHandle).toThrow('Subject handle identity is not admitted in this Engine.');
        } else {
          expect(restore).toThrow(fault === 'malformed' ? SyntaxError : TypeError);
          expect(expectedHandle).toThrow('Subject handle identity is not admitted in this Engine.');
          corrupt = false;
          restore();
          const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 8_000_000 });
          expect(client.expectGeo(first).toHaveVolume({ value: 6000, tolerance: 0.000001 }).status).toBe('passed');
        }
        expect(
          JSON.parse(
            decoder.decode(
              inner.subjectHandle(
                encode({
                  ...protocolHeader,
                  method: 'subjectHandle',
                  requestId: 'rollback-foreign-live',
                  ...foreign.subject,
                }),
              ),
            ),
          ),
        ).toMatchObject({ result: { subjectHandle: foreign.handle } });
      } finally {
        corrupt = false;
        await loader.releaseAll();
        expect(
          JSON.parse(
            decoder.decode(
              inner.subjectHandle(
                encode({
                  ...protocolHeader,
                  method: 'subjectHandle',
                  requestId: 'rollback-foreign-after-scope',
                  ...foreign.subject,
                }),
              ),
            ),
          ),
        ).toMatchObject({ result: { subjectHandle: foreign.handle } });
        release(inner, 'rollback-foreign-release', foreign.handle);
        inner.close?.();
      }
    },
  );
  it('should preserve a module-level subject across previous-test native resident eviction', async () => {
    const modulePath = resolve(installedRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
    const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
    const engine = new native.Engine();
    const original = new Uint8Array(await readFile(stepPath));
    const loader = createGeoSpecNativeModelLoader({
      engine,
      readSource: async (source) => {
        if (typeof source !== 'string') {
          throw new TypeError('This residency control reads only named fixture inputs.');
        }
        if (source === 'first.step') {
          return Uint8Array.from(original);
        }
        const suffix = encoder.encode(`\n/* ${source} */\n`);
        const bytes = new Uint8Array(original.length + suffix.length);
        bytes.set(original);
        bytes.set(suffix, original.length);
        return bytes;
      },
    });
    const code = `
      import { it, expectGeo } from 'geospec';
      import { loadModel } from 'geospec/model';
      const first = await loadModel({ source: 'first.step', format: 'step' });
      it('first subject', () => { expectGeo(first).toHaveVolume({ value: 6000, tolerance: 0.000001 }); });
      it('many subjects', async () => {
        for (let index = 0; index < 33; index += 1) {
          await loadModel({ source: 'later-' + index + '.step', format: 'step' });
        }
      });
      it('earlier subject again', () => { expectGeo(first).toHaveVolume({ value: 6000, tolerance: 0.000001 }); });
    `;
    async function readCode(path: string): Promise<Uint8Array<ArrayBuffer>>;
    async function readCode(path: string, encoding: 'utf8'): Promise<string>;
    async function readCode(_path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      return encoding === 'utf8' ? code : encoder.encode(code);
    }
    const vmFilesystem: VmFileSystem = {
      ...filesystem,
      exists: async () => true,
      readFile: readCode,
    };
    try {
      const result = await runGeoSpecModule({
        filesystem: vmFilesystem,
        entryPath,
        nativeAssertions: { engine },
        nativeModelLoader: loader,
      });
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      expect(result.passed).toBe(true);
      expect(result.tests.map(({ status }) => status)).toEqual(['passed', 'passed', 'passed']);
      const first = result.tests[0]!.assertions[0]!;
      const restored = result.tests[2]!.assertions[0]!;
      expect(restored.subject).toEqual(first.subject);
      expect(restored.loadId).toBe(first.loadId);
      expect(restored.report?.result['evidence']).toEqual(first.report?.result['evidence']);
    } finally {
      await loader.releaseAll();
      engine.close?.();
    }
  });
  it('should restore the first live canonical subject after more than32 actual native admissions', async () => {
    const modulePath = resolve(installedRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
    const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
    const engine = new native.Engine();
    const loader = createModelLoader({ engine });
    const original = new Uint8Array(await readFile(stepPath));
    const source = Uint8Array.from(original);
    try {
      const first = await loader({ source, format: 'step' });
      const chain = expectGeo(first);
      source.fill(0);
      const before = chain.toHaveVolume({ value: 6000, tolerance: 0.000001 });
      expect(before.passed).toBe(true);
      for (let index = 1; index <= 33; index += 1) {
        const suffix = encoder.encode(`\n/* retained scope ${index} */\n`);
        const bytes = new Uint8Array(original.length + suffix.length);
        bytes.set(original);
        bytes.set(suffix, original.length);
        // oxlint-disable-next-line no-await-in-loop -- Exercise one engine's unchanged32-subject resident cap serially.
        await loader({ source: bytes, format: 'step' });
      }
      const restored = chain.toHaveVolume({ value: 6000, tolerance: 0.000001 });
      expect(restored.passed).toBe(true);
      expect(restored.subject).toEqual(before.subject);
      expect(restored.report?.result['evidence']).toEqual(before.report?.result['evidence']);
      expect(restored.report?.status).toBe('passed');
      await loader.dispose();
      expect(() => chain.toHaveVolume({ value: 6000 })).toThrow('not admitted');
    } finally {
      await loader.dispose();
      engine.close?.();
    }
  });
  it('honors STEP mesh:false with zero eager tessellations and permits explicit demand', async () => {
    const modulePath = resolve(installedRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
    const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
    const engine = new native.Engine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    const observations = () =>
      JSON.parse(decoder.decode(engine.observations())) as { physical: { tessellations: string } };
    try {
      const source = new Uint8Array(
        await readFile(
          resolve(root, 'packages/geospec-engine/fixtures/containment/filter-inside-housing-positive/model.step'),
        ),
      );
      const subject = await loader({ source, format: 'step', mesh: false });
      expect(observations().physical.tessellations).toBe('0');
      const client = createGeoSpecAssertionClient({
        engine,
        claimId: () => 'mesh-false-demand',
        workUnitLimit: 8_000_000,
      });
      const report = client.expectGeo(subject).toHaveVoidContinuity({
        material: ['housing'],
        path: [{ occurrence: 'cartridge' }, [0, 0, 30]],
        bounds: { min: [-40, -40, -10], max: [40, 40, 80] },
      });
      expect(report.status).toBe('passed');
      expect(BigInt(observations().physical.tessellations)).toBeGreaterThan(0n);
    } finally {
      await loader.releaseAll();
      engine.close?.();
    }
  });
});

for (const route of routes) {
  describe(route.name, () => {
    it('loads authored STEP/Runtime GLB subjects through the native host', async () => {
      const packageRoot = resolve(installedRoot, 'node_modules');
      const modulePath = resolve(packageRoot, '@taucad/geospec-engine-native/dist', `${route.entry}.mjs`);
      const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
      await native.initialize?.();
      const standalonePath = resolve(packageRoot, 'geospec/dist/assertion-client/index.mjs');
      const standalone = (await import(/* @vite-ignore */ pathToFileURL(standalonePath).href)) as InstalledClientModule;
      const stepBytes = new Uint8Array(await readFile(stepPath));
      const glbBytes = new Uint8Array(await readFile(glbPath));
      expect(sha256(stepBytes)).toBe('5e97ff394bd8fd15318efa6b0345fcbdc7c80b4c6d30b8ad87a84b6cade19305');
      expect(sha256(glbBytes)).toBe('1321806f5b10c87126bece80cee96cf867c6c131db655a9f28558a39a086616d');

      const inner = new native.Engine();
      const releases: unknown[] = [];
      const admittedSubjectHashes: string[] = [];
      const timeline: string[] = [];
      const ingests: Array<{
        request: {
          format: string;
          frame: { coordinateSystem: string; sourceUnit: string; outputUnit: string };
          resources: Array<{ name: string; byteLength: number }>;
        };
        primaryByteLength: number;
        resourceByteLengths: number[];
      }> = [];
      const engine: GeoSpecNativeModelEngine = {
        evaluateClaim: (request) => inner.evaluateClaim(request),
        processRequest: (request) => inner.processRequest(request),
        ingestSubject(request, primary, resources) {
          ingests.push({
            request: JSON.parse(decoder.decode(request)) as (typeof ingests)[number]['request'],
            primaryByteLength: primary.byteLength,
            resourceByteLengths: resources.map((resource) => resource.byteLength),
          });
          const response = inner.ingestSubject(request, primary, resources);
          const admitted = JSON.parse(decoder.decode(response)) as { result: { subject: { subjectHash: string } } };
          admittedSubjectHashes.push(admitted.result.subject.subjectHash);
          return response;
        },
        subjectHandle: (request) => inner.subjectHandle(request),
        releaseSubject(request) {
          timeline.push('release');
          releases.push(JSON.parse(decoder.decode(request)) as unknown);
          return inner.releaseSubject(request);
        },
      };
      const runtimeCalls: Array<{ format: string; options: unknown }> = [];
      let runtimeConnects = 0;
      let runtimeTerminates = 0;
      const runtime: GeoSpecRuntimeClient & RuntimeClientWithRoutes = {
        async connect() {
          runtimeConnects += 1;
        },
        terminate() {
          runtimeTerminates += 1;
        },
        bestRouteFor(format) {
          return {
            kernelId: 'replicad',
            fidelity: format === 'step' ? 'brep' : 'mesh',
            exportOptions: {
              schema: { properties: { coordinateSystem: {}, unit: {} } },
              defaults: {},
            },
          };
        },
        open(input) {
          const document = mock<RuntimeDocument>();
          document.export.mockImplementation(async (format, request) => {
            runtimeCalls.push({ format, options: { source: input.source, options: request?.options } });
            return {
              success: true,
              exportId: 'glb',
              evaluationId: 'evaluation-1',
              issues: [],
              files: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.from(glbBytes) }],
            };
          });
          return document;
        },
      };
      const events: GeoSpecRunnerEvent[] = [];
      const runner = createNativeGeoSpecRunner({
        filesystem,
        nativeAssertions: { engine, workUnitLimit: 1_000_000 },
        model: {
          runtime,
          async readSource(source) {
            if (source !== 'baseline.step') {
              throw new Error(`Unexpected direct source: ${JSON.stringify(source)}`);
            }
            return Uint8Array.from(stepBytes);
          },
        },
      });
      for (const type of ['run-start', 'file-start', 'file-complete', 'run-complete', 'close'] as const) {
        runner.on(type, (event) => {
          events.push(event);
          timeline.push(event.type);
        });
      }

      try {
        const result = await runner.run({ files: [entryPath] });
        // This controlled Runtime exports pinned bytes without compiling a source graph.
        // Claims can pass, but that fixture must not qualify coherent source execution.
        expect(result.success).toBe(false);
        expect([result.passed, result.failed, result.selectedTests]).toEqual([3, 0, 3]);
        expect(result.files[0]?.result.success).toBe(true);
        expect(releases).toHaveLength(2);
        expect(runtimeConnects).toBe(1);
        expect(runtimeTerminates).toBe(0);
        expect(ingests).toMatchObject([
          {
            request: {
              format: 'step',
              frame: { coordinateSystem: 'z-up', sourceUnit: 'auto', outputUnit: 'mm' },
              resources: [],
            },
            primaryByteLength: stepBytes.byteLength,
            resourceByteLengths: [],
          },
          {
            request: {
              format: 'glb',
              frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', outputUnit: 'mm' },
              resources: [],
            },
            primaryByteLength: glbBytes.byteLength,
            resourceByteLengths: [],
          },
          {
            request: {
              format: 'step',
              frame: { coordinateSystem: 'z-up', sourceUnit: 'auto', outputUnit: 'mm' },
              resources: [],
            },
            primaryByteLength: stepBytes.byteLength,
            resourceByteLengths: [],
          },
          {
            request: {
              format: 'step',
              frame: { coordinateSystem: 'z-up', sourceUnit: 'auto', outputUnit: 'mm' },
              resources: [],
            },
            primaryByteLength: stepBytes.byteLength,
            resourceByteLengths: [],
          },
        ]);
        expect(admittedSubjectHashes).toHaveLength(4);
        expect(admittedSubjectHashes[2]).toBe(admittedSubjectHashes[0]);
        expect(admittedSubjectHashes[3]).toBe(admittedSubjectHashes[0]);
        expect(admittedSubjectHashes[1]).not.toBe(admittedSubjectHashes[0]);
        expect(runtimeCalls).toEqual([
          {
            format: 'glb',
            options: {
              source: { path: 'model.ts' },
              options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
            },
          },
        ]);
        expect(events.map(({ type }) => type)).toEqual(['run-start', 'file-start', 'file-complete', 'run-complete']);
        expect(timeline).toEqual(['run-start', 'file-start', 'file-complete', 'release', 'release', 'run-complete']);

        const fileResult = result.files[0]?.result;
        if (fileResult?.success !== true) {
          throw new Error('Native model host did not return test results.');
        }
        expect(fileResult.passed).toBe(false);
        expect(fileResult.lineage?.status).toBe('unavailable');
        const assertions = fileResult.tests.flatMap((test) => test.assertions);
        expect(assertions).toHaveLength(7);

        const reference = new native.Engine();
        const admittedStep = admission(reference, {
          bytes: stepBytes,
          format: 'step',
          sourceUnit: 'auto',
          requestId: 'reference-step',
        });
        const admittedGlb = admission(reference, {
          bytes: glbBytes,
          format: 'glb',
          sourceUnit: 'mm',
          requestId: 'reference-glb',
        });
        try {
          for (const assertion of assertions) {
            const { report } = assertion;
            if (report === undefined) {
              throw new Error('Native model assertion omitted its canonical report.');
            }
            const authoredSubject = assertion.subject as GeoSpecNativeSubject;
            const isStep = authoredSubject.subjectHash === admittedStep.subject.subjectHash;
            const subject = isStep ? admittedStep.subject : admittedGlb.subject;
            expect(assertion.subject).toEqual(subject);
            const client = standalone.createGeoSpecAssertionClient({
              engine: reference,
              claimId: () => report.claimId,
              workUnitLimit: 1_000_000,
            });
            // oxlint-disable-next-line no-await-in-loop -- Compare each authored report with the installed standalone client in deterministic order.
            const standaloneReport = await evaluateReference(client, { ...assertion, subject });
            expect(report).toEqual(standaloneReport);
          }
        } finally {
          release(reference, 'reference-glb:release', admittedGlb.handle);
          release(reference, 'reference-step:release', admittedStep.handle);
          reference.close?.();
        }

        const output = process.env['GEOSPEC_NATIVE_HOST_EVIDENCE'];
        if (output) {
          await mkdir(output, { recursive: true });
          await writeFile(
            resolve(output, `${route.entry}.json`),
            JSON.stringify(
              {
                route: route.name,
                modulePath,
                moduleSha256: sha256(await readFile(modulePath)),
                standalonePath,
                standaloneSha256: sha256(await readFile(standalonePath)),
                artifacts: {
                  step: { path: stepPath, bytes: stepBytes.byteLength, sha256: sha256(stepBytes) },
                  glb: { path: glbPath, bytes: glbBytes.byteLength, sha256: sha256(glbBytes) },
                },
                events: events.map(({ type }) => type),
                timeline,
                ingests,
                runtimeCalls,
                releases: releases.length,
                tests: fileResult.tests,
                reports: assertions.map((assertion) => serializableReport(assertion.report!)),
              },
              null,
              2,
            ) + '\n',
          );
        }
      } finally {
        await runner.close();
        expect(events.at(-1)?.type).toBe('close');
        inner.close?.();
      }
    });
  });
}
