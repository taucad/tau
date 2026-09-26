import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import type * as AssertionModule from 'geospec/assertion-client';
import type * as NativeModule from '@taucad/geospec-engine-native/node';
import type { JSONValue } from '@taucad/runtime/types';

type ArtifactRecord = {
  id: string;
  frame: { coordinateSystem: 'z-up'; sourceUnit: 'mm'; lengthUnit: 'millimeter' };
  artifact: { path: string; sha256: string };
  expected: { volume: number; boundingBoxSize: { x: number; y: number; z: number } };
};
type ByteRecord = { sha256: string; utf8: string };
type ClaimRecord = {
  matcher: string;
  canonicalClaim: ByteRecord;
  canonicalPlan: ByteRecord;
  canonicalResult: ByteRecord;
  result: GeoSpecCanonicalClaimReport['result'];
};
type Row = {
  id: string;
  artifactSha256: string;
  artifactBytes: number;
  subject: { subjectHash: string };
  initialize: ByteRecord;
  admission: ByteRecord;
  reports: ClaimRecord[];
};

const [workspace, installation, manifestPath, outputPath] = process.argv.slice(2);
assert.ok(workspace && installation && manifestPath && outputPath);
const installed = createRequire(resolve(installation, 'package.json'));
const nativePath = installed.resolve('@taucad/geospec-engine-native/node');
const clientPath = installed.resolve('geospec/assertion-client');
const nativeModule = (await import(pathToFileURL(nativePath).href)) as typeof NativeModule;
const { createGeoSpecAssertionClient } = (await import(pathToFileURL(clientPath).href)) as typeof AssertionModule;
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const byteRecord = (bytes: Uint8Array<ArrayBuffer>): ByteRecord => ({
  sha256: sha256(bytes),
  utf8: Buffer.from(bytes).toString('utf8'),
});
const encode = (value: unknown): Uint8Array<ArrayBuffer> => Buffer.from(JSON.stringify(value));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  format?: unknown;
  records: ArtifactRecord[];
};
const format = manifest.format ?? 'step';
assert.ok(format === 'step' || format === 'glb');
const header = { protocolVersion: 3, registryVersion: 5, canonicalProfile: 'geospec-jcs-v1' };
const workUnitBudget = 1_000_000;
const rows: Row[] = [];
const output = {
  route: 'installed-node-standalone',
  node: process.version,
  installation: resolve(installation),
  modules: [nativePath, clientPath].map((path) => ({ path, sha256: sha256(readFileSync(path)) })),
  exportManifestSha256: sha256(readFileSync(manifestPath)),
  admissions: [] as Array<{
    id: string;
    metadataFrame: ArtifactRecord['frame'];
    request: ByteRecord;
    response: ByteRecord;
  }>,
  rows,
};

try {
  for (const record of manifest.records) {
    const bytes: Uint8Array<ArrayBuffer> = readFileSync(resolve(workspace, record.artifact.path));
    assert.equal(sha256(bytes), record.artifact.sha256);
    const engine = new nativeModule.Engine();
    const initializedBytes = engine.processRequest(encode({ ...header, method: 'initialize', requestId: 'c2-init' }));
    const initialized = JSON.parse(Buffer.from(initializedBytes).toString('utf8')) as {
      result: { numericProfile: string };
    };
    assert.equal(initialized.result.numericProfile, 'geospec-st-logical-requests-v3');
    assert.deepEqual(record.frame, { coordinateSystem: 'z-up', lengthUnit: 'millimeter', sourceUnit: 'mm' });
    const admissionRequest = encode({
      ...header,
      method: 'ingestSubject',
      requestId: `c2-ingest-${record.id}`,
      format,
      frame: {
        coordinateSystem: record.frame.coordinateSystem,
        sourceUnit: format === 'glb' ? record.frame.sourceUnit : 'auto',
        outputUnit: 'mm',
      },
      ingestOptions: {},
      primaryByteLength: bytes.byteLength,
      resources: [],
    });
    const admissionBytes = engine.ingestSubject(admissionRequest, bytes, []);
    output.admissions.push({
      id: record.id,
      metadataFrame: record.frame,
      request: byteRecord(admissionRequest),
      response: byteRecord(admissionBytes),
    });
    const admitted = JSON.parse(Buffer.from(admissionBytes).toString('utf8')) as {
      result: { subject: { subjectHash: string } };
    };
    const subject = { subjectHash: admitted.result.subject.subjectHash };
    const handleBytes = engine.subjectHandle(
      encode({ ...header, method: 'subjectHandle', requestId: 'c2-handle', ...subject }),
    );
    const handle = (JSON.parse(Buffer.from(handleBytes).toString('utf8')) as { result: { subjectHandle: JSONValue } })
      .result.subjectHandle;
    const row: Row = {
      id: record.id,
      artifactSha256: sha256(bytes),
      artifactBytes: bytes.byteLength,
      subject,
      initialize: byteRecord(initializedBytes),
      admission: byteRecord(admissionBytes),
      reports: [],
    };
    output.rows.push(row);
    try {
      const client = createGeoSpecAssertionClient({
        engine,
        subjectSlot: 'subject',
        workUnitLimit: workUnitBudget,
        claimId: (matcher) => `c2-${record.id}-${matcher}`,
      });
      const chain = client.expectGeo(subject);
      const claims: ReadonlyArray<readonly [string, () => Promise<GeoSpecCanonicalClaimReport>]> = [
        ['toHaveVolume', async () => chain.toHaveVolume({ value: record.expected.volume, tolerance: 0.000001 })],
        [
          'toHaveBoundingBox',
          async () => chain.toHaveBoundingBox({ size: record.expected.boundingBoxSize, tolerance: 0.000001 }),
        ],
        format === 'glb'
          ? (['toBeWatertight', async () => chain.toBeWatertight()] as const)
          : (['toBeValidBrep', async () => chain.toBeValidBrep({ maxTolerance: 0.01 })] as const),
      ] as const;
      for (const [matcher, evaluate] of claims) {
        // oxlint-disable-next-line no-await-in-loop -- Keep ordinary native claims sequential on the owning thread.
        const report = await evaluate();
        row.reports.push({
          matcher,
          canonicalClaim: byteRecord(report.canonicalClaim),
          canonicalPlan: byteRecord(report.canonicalPlan),
          canonicalResult: byteRecord(report.canonicalResult),
          result: report.result,
        });
        assert.equal(report.status, 'passed');
      }
    } finally {
      engine.releaseSubject(
        encode({ ...header, method: 'releaseSubject', requestId: 'c2-release', subjectHandle: handle }),
      );
    }
    assert.equal(sha256(readFileSync(resolve(workspace, record.artifact.path))), record.artifact.sha256);
  }
} finally {
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}
console.log(
  JSON.stringify({
    status: 'passed',
    artifacts: output.rows.length,
    claims: output.rows.reduce((count, row) => count + row.reports.length, 0),
    outputPath,
  }),
);
