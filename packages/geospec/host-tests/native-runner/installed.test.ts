import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { describe, expect, it } from 'vitest';
import { createCollector, runGeoSpecModule } from 'geospec/runner';
import type { GeoSpecAssertion, GeoSpecBoundingBoxExpectation } from 'geospec/runner';
import type {
  GeoSpecAssertionClient,
  GeoSpecCanonicalClaimReport,
  GeoSpecNativeEngine,
} from 'geospec/assertion-client';

type NativeModule = {
  Engine: new () => GeoSpecNativeEngine & {
    close?: () => void;
    ingestMesh(request: Uint8Array<ArrayBuffer>, mesh: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  };
  initialize?: () => Promise<void>;
};
type InstalledClientModule = {
  createGeoSpecAssertionClient(options: {
    engine: GeoSpecNativeEngine;
    claimId: () => string;
    workUnitLimit: number;
  }): GeoSpecAssertionClient;
};
type CurrentMesh = { id: string; effectiveRequestUtf8: string; expectedUtf8: string; meshContentHash: string };
type OriginalMesh = { id: string; meshHex: string };

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('.', import.meta.url));
const entryPath = 'ordinary.geospec.ts';
const installedRoot = process.env['GEOSPEC_INSTALLED_CONSUMER_ROOT'];
if (!installedRoot) {
  throw new Error('GEOSPEC_INSTALLED_CONSUMER_ROOT must select the current prepared installed consumer.');
}
const routes = [
  { name: 'current native', entry: 'node' },
  { name: 'current mixed', entry: 'wasm' },
] as const;
const encoder = new TextEncoder();
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const bounds: GeoSpecBoundingBoxExpectation = {
  min: [-2, -3, -1],
  max: [4, 2, 5],
  center: { x: 1, y: -0.5, z: 2 },
  size: { x: 6, y: 5, z: 6 },
  tolerance: 0,
};
const wrongBounds: GeoSpecBoundingBoxExpectation = { ...bounds, max: [5, 2, 5] };

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

const reportBytes = (report: GeoSpecCanonicalClaimReport) => ({
  claimId: report.claimId,
  status: report.status,
  polarity: report.polarity,
  canonicalClaim: new TextDecoder().decode(report.canonicalClaim),
  canonicalPlan: new TextDecoder().decode(report.canonicalPlan),
  canonicalResult: new TextDecoder().decode(report.canonicalResult),
});

for (const route of routes) {
  describe(route.name, () => {
    it('ordinary VM assertions equal the installed standalone client', async () => {
      const packageRoot = resolve(installedRoot, 'node_modules');
      const modulePath = resolve(packageRoot, '@taucad/geospec-engine-native/dist', `${route.entry}.mjs`);
      const native = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as NativeModule;
      await native.initialize?.();
      const standalonePath = resolve(packageRoot, 'geospec/dist/assertion-client/index.mjs');
      const standalone = (await import(/* @vite-ignore */ pathToFileURL(standalonePath).href)) as InstalledClientModule;
      const currentBytes = await readFile(
        resolve(root, 'packages/geospec-engine-native/rust/tests/fixtures/current-profile-01/plan-corpus.json'),
      );
      expect(sha256(currentBytes)).toBe('eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d');
      const current = JSON.parse(currentBytes.toString()) as { meshes: CurrentMesh[] };
      const originalBytes = await readFile(
        resolve(root, 'packages/geospec-engine-native/conformance/early-corpus.json'),
      );
      expect(sha256(originalBytes)).toBe('3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476');
      const original = JSON.parse(originalBytes.toString()) as { meshes: OriginalMesh[] };
      const mesh = current.meshes.find((candidate) => candidate.id === 'asymmetric')!;
      const meshBytes = new Uint8Array(
        Buffer.from(original.meshes.find((candidate) => candidate.id === mesh.id)!.meshHex, 'hex'),
      );
      expect(sha256(meshBytes)).toBe(mesh.meshContentHash);
      const engine = new native.Engine();
      try {
        expect(new TextDecoder().decode(engine.ingestMesh(encoder.encode(mesh.effectiveRequestUtf8), meshBytes))).toBe(
          mesh.expectedUtf8,
        );
        const subject = { contentHash: mesh.meshContentHash };
        const loadedSubject = {
          ...subject,
          load: {
            loadId: 'fixture-load',
            status: 'complete',
            format: 'mesh-buffer-v1',
            parameters: {},
            ingestOptions: {},
            artifacts: [
              { name: 'frozen-asymmetric.gsm1', sha256: sha256(meshBytes), byteLength: meshBytes.byteLength },
              {
                name: 'frozen-asymmetric-ingest.json',
                sha256: sha256(encoder.encode(mesh.effectiveRequestUtf8)),
                byteLength: encoder.encode(mesh.effectiveRequestUtf8).byteLength,
              },
            ],
          },
        } as const;
        const builtinModules = {
          'native-subject': {
            version: '1',
            code: `export const bounds = ${JSON.stringify(bounds)}; export const wrongBounds = ${JSON.stringify(wrongBounds)};`,
          },
        };
        const options = { engine, workUnitLimit: 15 };
        const nativeCollector = createCollector({ nativeAssertions: options });
        expect(typeof nativeCollector.expectGeo(subject).toSatisfyRationalPlate).toBe('function');
        expect(typeof nativeCollector.expectGeo(subject).not.toSatisfyParallelPlaneDistance).toBe('function');
        const run = await runGeoSpecModule({
          filesystem,
          entryPath,
          builtinModules,
          nativeAssertions: options,
          nativeModelLoader: async (loadOptions) => {
            if (!('source' in loadOptions) || loadOptions.source !== 'frozen-asymmetric.gsm1') {
              throw new Error(`Unexpected frozen mesh source: ${JSON.stringify(loadOptions)}`);
            }
            return loadedSubject;
          },
          testNamePattern:
            '^native ordinary > (awaited pass|positive failure|negative pass|negative failure|unawaited pass)$',
        });
        if (!run.success) {
          throw new Error(JSON.stringify(run.issues));
        }
        expect(run.passed).toBe(false);
        expect(run.tests.map((test) => [test.name, test.status, test.assertions.length])).toEqual([
          ['awaited pass', 'passed', 1],
          ['positive failure', 'failed', 1],
          ['negative pass', 'passed', 1],
          ['negative failure', 'failed', 1],
          ['unawaited pass', 'passed', 2],
        ]);
        const refused = await runGeoSpecModule({
          filesystem,
          entryPath,
          builtinModules,
          nativeAssertions: { ...options, workUnitLimit: 14 },
          nativeModelLoader: async (loadOptions) => {
            if (!('source' in loadOptions) || loadOptions.source !== 'frozen-asymmetric.gsm1') {
              throw new Error(`Unexpected frozen mesh source: ${JSON.stringify(loadOptions)}`);
            }
            return loadedSubject;
          },
          testNamePattern: '^native ordinary > ordinary budget refusal$',
        });
        if (!refused.success) {
          throw new Error(JSON.stringify(refused.issues));
        }
        expect(refused.passed).toBe(false);
        expect(refused.tests[0]?.status).toBe('inconclusive');
        expect(refused.tests[0]?.assertions[0]?.report?.status).toBe('refused');
        const assertions: GeoSpecAssertion[] = [...run.tests, ...refused.tests].flatMap((test) => test.assertions);
        expect(assertions.map((assertion) => assertion.report?.status)).toEqual([
          'passed',
          'failed',
          'passed',
          'failed',
          'passed',
          'passed',
          'refused',
        ]);
        for (const assertion of assertions) {
          const report = assertion.report!;
          const client = standalone.createGeoSpecAssertionClient({
            ...options,
            claimId: () => report.claimId,
            workUnitLimit: report.status === 'refused' ? 14 : 15,
          });
          const chain = report.polarity === 'negative' ? client.expectGeo(subject).not : client.expectGeo(subject);
          let reference: GeoSpecCanonicalClaimReport;
          try {
            reference = chain.toHaveBoundingBox(assertion.expected as typeof bounds);
          } catch (error) {
            reference = (error as { report: GeoSpecCanonicalClaimReport }).report;
          }
          expect(report).toEqual(reference);
          expect(assertion.diagnostics).toEqual(report.status === 'passed' ? [] : report.diagnostics);
          expect(assertion.passed).toBe(report.status === 'passed');
          expect(assertion.durationMs).toBeGreaterThanOrEqual(0);
        }
        const output = process.env['GEOSPEC_NATIVE_RUNNER_EVIDENCE'];
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
                tests: [...run.tests, ...refused.tests].map((test) => ({
                  name: test.name,
                  status: test.status,
                  diagnostics: test.diagnostics,
                })),
                reports: assertions.map((assertion) => reportBytes(assertion.report!)),
              },
              null,
              2,
            ) + '\n',
          );
        }
      } finally {
        engine.close?.();
      }
    });
  });
}
