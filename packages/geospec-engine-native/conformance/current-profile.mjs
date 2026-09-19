/** @typedef {{ id: string, requestUtf8: string, meshHex: string, contentHash: string, expectedUtf8: string }} CorpusMesh */
/** @typedef {{ id: string, operation: 'canonicalize' | 'ingestMesh' | 'processRequest' | 'canonicalPlan' | 'evaluatePlan', inputUtf8?: string, inputHex?: string, ingest: string[], meshHex?: string, expectedUtf8?: string, expectedCode?: string, expectedMessage?: string }} CorpusRecord */
/** @typedef {{ schemaVersion: number, meshes: CorpusMesh[], records: CorpusRecord[], equivalentCanonicalGroups: string[][] }} Corpus */
/** @typedef {{ id: string, meshContentHash: string, originalRequestSha256: string, effectiveRequestSha256: string, effectiveRequestUtf8: string, expectedUtf8: string }} MeshBinding */
/** @typedef {CorpusRecord & { originalInputSha256: string, effectiveInputSha256: string, effectiveInputUtf8?: string, effectiveInputHex?: string, preservesOriginalBytes?: boolean }} RecordBinding */
/** @typedef {{ schemaVersion: number, authority: { adoptedRuling: string, originalCorpusSha256: string }, meshes: MeshBinding[], records: RecordBinding[] }} CurrentProfile */

const originalSha256 = '3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476';
const profileSha256 = 'eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d';
const encoder = new TextEncoder();

/** @type {(bytes: Uint8Array) => Promise<string>} */
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** @type {(condition: boolean, label: string) => void} */
const requireMatch = (condition, label) => {
  if (!condition) {
    throw new Error(`Current conformance binding mismatch: ${label}`);
  }
};

/** @type {(utf8: string | undefined, hex: string | undefined) => Uint8Array} */
const input = (utf8, hex) => {
  if (utf8 !== undefined) {
    return encoder.encode(utf8);
  }
  if (hex === undefined || !/^(?:[\da-f]{2})*$/i.test(hex)) {
    throw new Error('Conformance input is missing or has invalid hex.');
  }
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
};

/**
 * Join immutable original bytes to the accepted current-profile authority by ID.
 * This reads fixture data only; it never derives expectations from an engine.
 * @param originalBytes - Exact early-corpus.json bytes.
 * @param profileBytes - Exact current-profile-01/plan-corpus.json bytes.
 * @returns Current inputs/expectations in original order and both authority digests.
 * @internal
 * @type {(originalBytes: Uint8Array, profileBytes: Uint8Array) => Promise<Corpus & { originalSha256: string, profileSha256: string }>}
 */
export const joinCurrentCorpus = async (originalBytes, profileBytes) => {
  requireMatch((await digest(originalBytes)) === originalSha256, 'original corpus SHA-256');
  requireMatch((await digest(profileBytes)) === profileSha256, 'current profile SHA-256');
  const original = /** @type {Corpus} */ (JSON.parse(new TextDecoder().decode(originalBytes)));
  const profile = /** @type {CurrentProfile} */ (JSON.parse(new TextDecoder().decode(profileBytes)));
  requireMatch(original.schemaVersion === 1 && profile.schemaVersion === 1, 'schema');
  requireMatch(profile.authority.adoptedRuling === 'W2.C-CURRENT-PROFILE-CONFORMANCE-01', 'ruling');
  requireMatch(profile.authority.originalCorpusSha256 === originalSha256, 'original authority');
  requireMatch(original.records.length === 320 && profile.records.length === 320, 'record count');
  requireMatch(original.meshes.length === 4 && profile.meshes.length === 4, 'mesh count');
  const recordBindings = new Map(profile.records.map((record) => [record.id, record]));
  const meshBindings = new Map(profile.meshes.map((mesh) => [mesh.id, mesh]));
  requireMatch(recordBindings.size === 320 && new Set(original.records.map(({ id }) => id)).size === 320, 'record IDs');
  requireMatch(meshBindings.size === 4 && new Set(original.meshes.map(({ id }) => id)).size === 4, 'mesh IDs');

  const meshes = await Promise.all(
    original.meshes.map(async (mesh) => {
      const bound = meshBindings.get(mesh.id);
      if (bound === undefined) {
        throw new Error(`Missing current mesh binding: ${mesh.id}`);
      }
      requireMatch((await digest(encoder.encode(mesh.requestUtf8))) === bound.originalRequestSha256, mesh.id);
      requireMatch(
        (await digest(encoder.encode(bound.effectiveRequestUtf8))) === bound.effectiveRequestSha256,
        mesh.id,
      );
      requireMatch(
        (await digest(input(undefined, mesh.meshHex))) === bound.meshContentHash &&
          mesh.contentHash === bound.meshContentHash,
        mesh.id,
      );
      return { ...mesh, requestUtf8: bound.effectiveRequestUtf8, expectedUtf8: bound.expectedUtf8 };
    }),
  );
  const records = await Promise.all(
    original.records.map(async (record) => {
      const bound = recordBindings.get(record.id);
      if (bound === undefined) {
        throw new Error(`Missing current record binding: ${record.id}`);
      }
      requireMatch(
        bound.operation === record.operation && JSON.stringify(bound.ingest) === JSON.stringify(record.ingest),
        record.id,
      );
      requireMatch((await digest(input(record.inputUtf8, record.inputHex))) === bound.originalInputSha256, record.id);
      requireMatch(
        (await digest(input(bound.effectiveInputUtf8, bound.effectiveInputHex))) === bound.effectiveInputSha256,
        record.id,
      );
      requireMatch(
        !bound.preservesOriginalBytes || bound.originalInputSha256 === bound.effectiveInputSha256,
        record.id,
      );
      // Mirror the accepted Rust runner's fresh-admission setup, without rewriting a claim.
      const ingest =
        record.ingest.length === 0 &&
        ['evaluatePlan', 'processRequest'].includes(record.operation) &&
        (record.expectedUtf8 !== undefined || record.id === 'plan/unavailable/analyzeBrep/evaluatePlan')
          ? [original.meshes[0].id]
          : record.ingest;
      return {
        ...record,
        inputUtf8: bound.effectiveInputUtf8,
        inputHex: bound.effectiveInputHex,
        expectedUtf8: bound.expectedUtf8,
        expectedCode: bound.expectedCode,
        expectedMessage: bound.expectedMessage,
        ingest,
      };
    }),
  );
  return { ...original, meshes, records, originalSha256, profileSha256 };
};
