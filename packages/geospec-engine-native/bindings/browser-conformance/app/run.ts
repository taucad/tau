// eslint-disable-next-line import-x/no-extraneous-dependencies -- This package-owned browser fixture imports its installed public root through the consumer resolver; it is not an external dependency.
import { Engine, canonicalize, initialize } from '@taucad/geospec-engine-native';

type CorpusMesh = {
  id: string;
  requestUtf8: string;
  meshHex: string;
  expectedUtf8: string;
};

type CorpusRecord = {
  id: string;
  operation: 'canonicalize' | 'ingestMesh' | 'processRequest' | 'canonicalPlan' | 'evaluatePlan';
  inputUtf8?: string;
  inputHex?: string;
  ingest: string[];
  meshHex?: string;
  expectedUtf8?: string;
  expectedCode?: string;
};

type Corpus = {
  schemaVersion: number;
  meshes: CorpusMesh[];
  records: CorpusRecord[];
  equivalentCanonicalGroups: string[][];
};

type ByteArray = Uint8Array<ArrayBuffer>;

type CorpusResult = {
  [key: string]: unknown;
  id: string;
  passed: boolean;
  admissions: unknown[];
  actualUtf8?: string;
  expectedUtf8?: string;
};

type Completion = { report: unknown } | { error: string };

const expectedCorpusHash = '3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sha256 = async (value: ArrayBuffer | ByteArray): Promise<string> => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const fromHex = (value: string): ByteArray => {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
};

const toHex = (value: ByteArray): string => [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const inputBytes = (record: CorpusRecord): ByteArray => {
  if (record.inputHex !== undefined) {
    return fromHex(record.inputHex);
  }
  if (record.inputUtf8 !== undefined) {
    return encoder.encode(record.inputUtf8);
  }
  throw new Error(`Corpus record ${record.id} has no input bytes.`);
};

const decodedEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => decodedEqual(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && decodedEqual(leftRecord[key], rightRecord[key]))
  );
};

const compareBytes = (actual: ByteArray, expectedUtf8: string) => {
  const expected = encoder.encode(expectedUtf8);
  const actualUtf8 = decoder.decode(actual);
  let equalWhenDecoded = false;
  try {
    equalWhenDecoded = decodedEqual(JSON.parse(actualUtf8) as unknown, JSON.parse(expectedUtf8) as unknown);
  } catch {
    equalWhenDecoded = false;
  }
  return {
    actualHex: toHex(actual),
    actualUtf8,
    bytesEqual: actual.length === expected.length && actual.every((byte, index) => byte === expected[index]),
    decodedEqual: equalWhenDecoded,
    expectedHex: toHex(expected),
    expectedUtf8,
  };
};

const errorDetails = (error: unknown): { code: string; message: string } => {
  if (typeof error !== 'object' || error === null) {
    return { code: '', message: '' };
  }
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value.code === 'string' ? value.code : '',
    message: typeof value.message === 'string' ? value.message : '',
  };
};

const invoke = (engine: Engine, record: CorpusRecord): ByteArray => {
  const input = inputBytes(record);
  switch (record.operation) {
    case 'canonicalize': {
      return new Uint8Array(canonicalize(input));
    }
    case 'ingestMesh': {
      if (record.meshHex === undefined) {
        throw new Error(`Corpus record ${record.id} has no mesh bytes.`);
      }
      return new Uint8Array(engine.ingestMesh(input, fromHex(record.meshHex)));
    }
    case 'processRequest': {
      return new Uint8Array(engine.processRequest(input));
    }
    case 'canonicalPlan': {
      return new Uint8Array(engine.canonicalPlan(input));
    }
    case 'evaluatePlan': {
      return new Uint8Array(engine.evaluatePlan(input));
    }
  }
};

const readCorpus = async (): Promise<{
  corpus: Corpus;
  corpusSha256: string;
}> => {
  const response = await fetch('/early-corpus.json');
  if (!response.ok) {
    throw new Error(`Unable to read frozen corpus: ${response.status}`);
  }
  const corpusBytes = new Uint8Array(await response.arrayBuffer());
  const corpusSha256 = await sha256(corpusBytes);
  if (corpusSha256 !== expectedCorpusHash) {
    throw new Error(`Frozen corpus hash changed: ${corpusSha256}`);
  }
  const corpus = JSON.parse(decoder.decode(corpusBytes)) as Corpus;
  if (corpus.schemaVersion !== 1 || corpus.records.length !== 320) {
    throw new Error('Frozen corpus schema/count changed.');
  }
  return { corpus, corpusSha256 };
};

const run = async () => {
  const { corpus, corpusSha256 } = await readCorpus();
  await initialize();
  const wasmUrl = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .find((url) => url.includes('geospec_engine_native_wasm_bg.wasm'));
  if (wasmUrl === undefined) {
    throw new Error('The packed public root did not load its shipped WASM asset.');
  }
  const wasmResponse = await fetch(wasmUrl);
  if (!wasmResponse.ok) {
    throw new Error(`Unable to re-read loaded WASM asset: ${wasmResponse.status}`);
  }
  const wasmSha256 = await sha256(await wasmResponse.arrayBuffer());

  const meshes = new Map(corpus.meshes.map((mesh) => [mesh.id, mesh]));
  const results: CorpusResult[] = [];
  for (const record of corpus.records) {
    const engine = new Engine();
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
          engine.ingestMesh(encoder.encode(mesh.requestUtf8), fromHex(mesh.meshHex)),
          mesh.expectedUtf8,
        );
        admissions.push({ meshId, ...comparison });
        if (!comparison.bytesEqual || !comparison.decodedEqual) {
          admissionFailure = { meshId, ...comparison };
          break;
        }
      } catch (error) {
        admissionFailure = { meshId, ...errorDetails(error) };
        break;
      }
    }
    if (admissionFailure !== undefined) {
      results.push({
        id: record.id,
        passed: false,
        admissions,
        admissionFailure,
      });
      continue;
    }

    try {
      const actual = invoke(engine, record);
      if (record.expectedCode !== undefined) {
        results.push({
          id: record.id,
          passed: false,
          admissions,
          expectedCode: record.expectedCode,
          unexpectedSuccessHex: toHex(actual),
          unexpectedSuccessUtf8: decoder.decode(actual),
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
        passed: record.expectedCode !== undefined && actual.code === record.expectedCode && actual.message.length > 0,
        admissions,
        expectedCode: record.expectedCode,
        ...actual,
      });
    }
  }

  const resultsById = new Map(results.map((result) => [result.id, result]));
  const equivalentCanonicalGroups = corpus.equivalentCanonicalGroups.map((ids) => {
    const group = ids.map((id) => resultsById.get(id));
    const expected = group.map((result) => result?.expectedUtf8);
    const actual = group.map((result) => result?.actualUtf8);
    return {
      ids,
      expectedUtf8: expected,
      actualUtf8: actual,
      passed:
        group.every((result) => result?.passed === true) &&
        expected.every((value) => value === expected[0]) &&
        actual.every((value) => value === actual[0]),
    };
  });
  const mismatches = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    host: 'browser-packed-root',
    userAgent: navigator.userAgent,
    corpus: { sha256: corpusSha256, records: corpus.records.length },
    wasmAsset: { url: wasmUrl, sha256: wasmSha256 },
    admissions: results.reduce((count, result) => count + result.admissions.length, 0),
    passed: results.length - mismatches.length,
    failed: mismatches.length,
    equivalentCanonicalGroups,
    results,
    mismatches,
  };
};

const status = document.querySelector<HTMLOutputElement>('#status');
if (status === null) {
  throw new Error('Fixture status element is missing.');
}
const completionTarget = globalThis as typeof globalThis & {
  __geospecConformance?: Completion;
};
try {
  completionTarget.__geospecConformance = { report: await run() };
  status.textContent = 'complete';
} catch (error) {
  completionTarget.__geospecConformance = {
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
  status.textContent = 'failed';
}
