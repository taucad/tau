import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { describe, expect, it } from 'vitest';
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

type NativeModule = {
  Engine: new () => GeoSpecNativeModelEngine & { close?: () => void };
  initialize?: () => Promise<void>;
  canonicalize(input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
};
type InstalledClientModule = {
  createGeoSpecAssertionClient(options: {
    engine: GeoSpecNativeModelEngine;
    canonicalize: NativeModule['canonicalize'];
    claimId: () => string;
    workUnitLimit: number;
  }): GeoSpecAssertionClient;
};

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('.', import.meta.url));
const entryPath = 'model.geospec.ts';
const legacyGuardEntryPath = 'native-helper-legacy.geospec.ts';
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

describe('native authoring helper', () => {
  it('rejects an authored native assertion in legacy VM mode', async () => {
    const result = await runGeoSpecModule({ filesystem, entryPath: legacyGuardEntryPath });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.passed).toBe(false);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0]?.status).toBe('failed');
    expect(result.tests[0]?.diagnostics).toEqual([
      expect.objectContaining({ message: 'Native expectGeo requires a collector configured with nativeAssertions.' }),
    ]);
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
        canonicalPlan: (request) => inner.canonicalPlan(request),
        evaluatePlan: (plan) => inner.evaluatePlan(plan),
        processRequest: (request) => inner.processRequest(request),
        ingestSubject(request, primary, resources) {
          ingests.push({
            request: JSON.parse(decoder.decode(request)) as (typeof ingests)[number]['request'],
            primaryByteLength: primary.byteLength,
            resourceByteLengths: resources.map((resource) => resource.byteLength),
          });
          return inner.ingestSubject(request, primary, resources);
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
        async export(format, options) {
          runtimeCalls.push({ format, options });
          return {
            success: true,
            issues: [],
            data: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: Uint8Array.from(glbBytes) }],
          };
        },
      };
      const events: GeoSpecRunnerEvent[] = [];
      const runner = createNativeGeoSpecRunner({
        filesystem,
        nativeAssertions: { engine, canonicalize: native.canonicalize, workUnitLimit: 1_000_000 },
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
        expect(result.success).toBe(true);
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
        expect(runtimeCalls).toEqual([
          {
            format: 'glb',
            options: {
              source: { path: 'model.ts' },
              exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
            },
          },
        ]);
        expect(events.map(({ type }) => type)).toEqual(['run-start', 'file-start', 'file-complete', 'run-complete']);
        expect(timeline).toEqual(['run-start', 'file-start', 'file-complete', 'release', 'release', 'run-complete']);

        const fileResult = result.files[0]?.result;
        if (fileResult?.success !== true) {
          throw new Error('Native model host did not return test results.');
        }
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
            const report = assertion.nativeReport;
            if (report === undefined) {
              throw new Error('Native model assertion omitted its canonical report.');
            }
            const authoredSubject = assertion.subject as GeoSpecNativeSubject;
            const isStep = authoredSubject.subjectHash === admittedStep.subject.subjectHash;
            const subject = isStep ? admittedStep.subject : admittedGlb.subject;
            expect(assertion.subject).toEqual(subject);
            const client = standalone.createGeoSpecAssertionClient({
              engine: reference,
              canonicalize: native.canonicalize,
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
                reports: assertions.map((assertion) => serializableReport(assertion.nativeReport!)),
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
