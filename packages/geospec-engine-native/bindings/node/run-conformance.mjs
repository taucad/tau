import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
// oxlint-disable-next-line no-restricted-imports -- Package-owned conformance fixtures share one pinned input join.
import { joinCurrentCorpus } from '../../conformance/current-profile.mjs';

/** @typedef {{ id: string, operation: 'canonicalize' | 'ingestMesh' | 'processRequest' | 'canonicalPlan' | 'evaluatePlan', inputUtf8?: string, inputHex?: string, ingest: string[], meshHex?: string, expectedUtf8?: string, expectedCode?: string, expectedMessage?: string }} CorpusRecord */
/** @typedef {{ close?: () => void, ingestMesh: (request: Uint8Array, mesh: Uint8Array) => Uint8Array, processRequest: (request: Uint8Array) => Uint8Array, canonicalPlan: (request: Uint8Array) => Uint8Array, evaluatePlan: (plan: Uint8Array) => Uint8Array }} BindingEngine */
/** @typedef {{ Engine: new () => BindingEngine, canonicalize: (input: Uint8Array) => Uint8Array }} Binding */
/** @typedef {{ passed: boolean, [key: string]: unknown }} CorpusResult */
/** @typedef {{ passed: number, failed: number, results: CorpusResult[], mismatches: CorpusResult[] }} CorpusReport */

const corpusUrl = new URL('../../conformance/early-corpus.json', import.meta.url);
const profileUrl = new URL('../../rust/tests/fixtures/current-profile-01/plan-corpus.json', import.meta.url);

/** @type {(record: CorpusRecord) => Buffer} */
const bytes = (record) => {
  if (record.inputHex !== undefined) {
    return Buffer.from(record.inputHex, 'hex');
  }
  if (record.inputUtf8 !== undefined) {
    return Buffer.from(record.inputUtf8);
  }
  throw new Error(`Corpus record ${record.id} has no input bytes.`);
};

/** @type {(error: unknown) => { code: string, message: string }} */
const errorDetails = (error) => {
  if (typeof error !== 'object' || error === null) {
    return { code: '', message: '' };
  }
  const value = /** @type {{ code?: unknown, message?: unknown }} */ (error);
  return {
    code: typeof value.code === 'string' ? value.code : '',
    message: typeof value.message === 'string' ? value.message : '',
  };
};

/** @type {(binding: Binding, engine: BindingEngine, record: CorpusRecord) => Uint8Array} */
const invoke = (binding, engine, record) => {
  const input = bytes(record);
  switch (record.operation) {
    case 'canonicalize': {
      return binding.canonicalize(input);
    }
    case 'ingestMesh': {
      if (record.meshHex === undefined) {
        throw new Error(`Corpus record ${record.id} has no mesh bytes.`);
      }
      return engine.ingestMesh(input, Buffer.from(record.meshHex, 'hex'));
    }
    case 'processRequest': {
      return engine.processRequest(input);
    }
    case 'canonicalPlan': {
      return engine.canonicalPlan(input);
    }
    case 'evaluatePlan': {
      return engine.evaluatePlan(input);
    }
    default: {
      throw new Error('Unknown corpus operation.');
    }
  }
};

/** @type {(actual: Uint8Array, expectedUtf8: string) => { actualHex: string, actualUtf8: string, bytesEqual: boolean, decodedEqual: boolean, expectedHex: string, expectedUtf8: string }} */
const compareBytes = (actual, expectedUtf8) => {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedUtf8);
  const actualUtf8 = actualBytes.toString();
  let decodedEqual = false;
  try {
    decodedEqual = isDeepStrictEqual(JSON.parse(actualUtf8), JSON.parse(expectedUtf8));
  } catch {
    decodedEqual = false;
  }
  return {
    actualHex: actualBytes.toString('hex'),
    actualUtf8,
    bytesEqual: actualBytes.equals(expectedBytes),
    decodedEqual,
    expectedHex: expectedBytes.toString('hex'),
    expectedUtf8,
  };
};

/** @type {(options: { binding: Binding, host: string, artifacts?: string[], output?: string, recordIds?: string[] }) => Promise<CorpusReport>} */
export const runEarlyCorpus = async ({ binding, host, artifacts = [], output, recordIds }) => {
  const corpus = await joinCurrentCorpus(await readFile(corpusUrl), await readFile(profileUrl));
  const selected =
    recordIds === undefined
      ? corpus.records
      : recordIds.map((id) => {
          const record = corpus.records.find((entry) => entry.id === id);
          if (record === undefined) {
            throw new Error(`Unknown conformance record: ${id}`);
          }
          return record;
        });
  const meshes = new Map(corpus.meshes.map((mesh) => [mesh.id, mesh]));
  /** @type {CorpusResult[]} */
  const results = [];

  for (const record of selected) {
    const engine = new binding.Engine();
    try {
      const admissions = [];
      let admissionFailure;
      for (const meshId of record.ingest) {
        const mesh = meshes.get(meshId);
        if (mesh === undefined) {
          admissionFailure = { meshId, message: 'Unknown mesh ID.' };
          break;
        }
        try {
          const comparison = compareBytes(
            engine.ingestMesh(Buffer.from(mesh.requestUtf8), Buffer.from(mesh.meshHex, 'hex')),
            mesh.expectedUtf8,
          );
          admissions.push({ meshId, ...comparison });
          admissionFailure = comparison.bytesEqual && comparison.decodedEqual ? undefined : { meshId, ...comparison };
        } catch (error) {
          admissionFailure = { meshId, ...errorDetails(error) };
        }
        if (admissionFailure !== undefined) {
          break;
        }
      }
      if (admissionFailure !== undefined) {
        results.push({ id: record.id, passed: false, admissions, admissionFailure });
        continue;
      }

      try {
        const actual = invoke(binding, engine, record);
        if (record.expectedCode !== undefined) {
          const actualBytes = Buffer.from(actual);
          results.push({
            id: record.id,
            passed: false,
            admissions,
            expectedCode: record.expectedCode,
            unexpectedSuccessHex: actualBytes.toString('hex'),
            unexpectedSuccessUtf8: actualBytes.toString(),
          });
          continue;
        }
        if (record.expectedUtf8 === undefined) {
          throw new Error(`Corpus record ${record.id} has no success expectation.`);
        }
        const comparison = compareBytes(actual, record.expectedUtf8);
        results.push({
          id: record.id,
          passed: comparison.bytesEqual && comparison.decodedEqual,
          admissions,
          ...comparison,
        });
      } catch (error) {
        const actual = errorDetails(error);
        results.push({
          id: record.id,
          passed:
            record.expectedCode !== undefined &&
            actual.code === record.expectedCode &&
            actual.message.length > 0 &&
            (record.expectedMessage === undefined || actual.message === record.expectedMessage),
          admissions,
          expectedCode: record.expectedCode,
          ...actual,
        });
      }
    } finally {
      engine.close?.();
    }
  }

  const artifactHashes = Object.fromEntries(
    await Promise.all(
      artifacts.map(async (artifact) => {
        const artifactBytes = await readFile(artifact);
        return /** @type {[string, string]} */ ([artifact, createHash('sha256').update(artifactBytes).digest('hex')]);
      }),
    ),
  );
  const mismatches = results.filter((result) => !result.passed);
  const report = {
    schemaVersion: 1,
    host,
    runtime: process.version,
    corpus: {
      path: fileURLToPath(corpusUrl),
      sha256: corpus.originalSha256,
      currentProfilePath: fileURLToPath(profileUrl),
      currentProfileSha256: corpus.profileSha256,
      records: corpus.records.length,
      selectedRecords: selected.length,
    },
    artifacts: artifactHashes,
    passed: results.length - mismatches.length,
    failed: mismatches.length,
    results,
    mismatches,
  };
  const encoded = `${JSON.stringify(report, undefined, 2)}\n`;
  if (output !== undefined) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, encoded);
  }
  return report;
};

/** @type {() => Map<string, string>} */
const parseArguments = () => {
  const argumentsByName = /** @type {Map<string, string>} */ (new Map());
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    argumentsByName.set(name, value);
  }
  return argumentsByName;
};

if (import.meta.main) {
  const argumentsByName = parseArguments();
  const modulePath = resolve(
    argumentsByName.get('--module') ?? fileURLToPath(new URL('generated/index.js', import.meta.url)),
  );
  const binaryPath = resolve(
    argumentsByName.get('--binary') ??
      fileURLToPath(new URL('generated/geospec-engine-native.darwin-arm64.node', import.meta.url)),
  );
  const binding = /** @type {Binding} */ (await import(pathToFileURL(modulePath).href));
  const report = await runEarlyCorpus({
    binding,
    host: 'node-napi',
    artifacts: [modulePath, binaryPath],
    output: argumentsByName.get('--output'),
    recordIds: argumentsByName.get('--ids')?.split(','),
  });
  process.stdout.write(`${JSON.stringify({ passed: report.passed, failed: report.failed })}\n`);
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}
