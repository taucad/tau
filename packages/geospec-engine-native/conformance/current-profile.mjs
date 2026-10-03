/** @typedef {{ id: string, admission?: 'mesh', requestUtf8: string, meshHex: string, contentHash: string, expectedUtf8: string }} MeshAdmission */
/** @typedef {{ name: string, hex: string, sha256: string, byteLength: number }} SubjectResource */
/** @typedef {{ id: string, admission: 'subject', requestUtf8: string, requestSha256: string, primaryHex: string, primarySha256: string, primaryByteLength: number, resources: SubjectResource[], contentHash: string, subjectHash: string, expectedUtf8: string }} SubjectAdmission */
/** @typedef {MeshAdmission | SubjectAdmission} CorpusMesh */
/** @typedef {{ id: string, operation: 'canonicalize' | 'ingestMesh' | 'processRequest' | 'canonicalPlan' | 'evaluatePlan', inputUtf8?: string, inputHex?: string, ingest: string[], meshHex?: string, expectedUtf8?: string, expectedCode?: string, expectedMessage?: string }} CorpusRecord */
/** @typedef {{ schemaVersion: number, meshes: CorpusMesh[], records: CorpusRecord[], equivalentCanonicalGroups: string[][] }} Corpus */
/** @typedef {{ schemaVersion: number, meshes: MeshAdmission[], records: CorpusRecord[], equivalentCanonicalGroups: string[][] }} LegacyCorpus */
/** @typedef {{ id: string, meshContentHash: string, originalRequestSha256: string, effectiveRequestSha256: string, effectiveRequestUtf8: string, expectedUtf8: string }} MeshBinding */
/** @typedef {CorpusRecord & { originalInputSha256: string, effectiveInputSha256: string, effectiveInputUtf8?: string, effectiveInputHex?: string, preservesOriginalBytes?: boolean }} RecordBinding */
/** @typedef {{ schemaVersion: number, authority: { adoptedRuling: string, originalCorpusSha256: string }, meshes: MeshBinding[], records: RecordBinding[] }} CurrentProfile */

const originalSha256 = '3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476';
const profileSha256 = 'eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d';
const successorSha256 = '5dfd1c400ff18b91804cf5514dfc862f47a975bea00877fbd4f2d5ffe609e34f';
const materialSuccessorSha256 = 'c36f2296878e3daa57cc0cdfe8c86dac3b77ed80d6ddbd60de68b31a64bba5f7';
const materialCorpusSha256 = '45b98aa9bdc83b0846e74837e5891f4d9c7c7a51b6488db2ae23e8ccbe833975';
const oldNumericProfileField = '"numericProfile":"geospec-st-logical-requests-v3"';
const stringAxisIds = new Set([
  'a2/invalid-claim/string-axis',
  'plan/invalid-claim/string-axis/canonical',
  'plan/invalid-claim/string-axis/evaluate',
]);
const encoder = new TextEncoder();
const bboxRepairIds = new Set([
  'a2/raw/all-axis-failure-order',
  'plan/a2/all-axis-failure-order/evaluate',
  'a2/raw/tolerance-outside',
  'plan/a2/tolerance-outside/evaluate',
  'a2/raw/default-tolerance-outside',
  'plan/a2/default-tolerance-outside/evaluate',
  'a2/raw/zero-tolerance',
  'plan/a2/zero-tolerance/evaluate',
]);
const oldBboxRepair = 'Correct the model dimensions, or widen the declared bounding-box tolerance.';
const currentBboxRepair = 'Correct the model dimensions to match the declared bounds; preserve the authored tolerance.';

/** @type {(id: string, text: string | undefined) => string | undefined} */
export const projectMaterialRepairSuggestion = (id, text) => {
  if (!bboxRepairIds.has(id)) {
    return text;
  }
  if (text === undefined) {
    throw new Error(`Current conformance binding mismatch: ${id}: missing bbox expectation`);
  }
  const raw = text;
  const parsed =
    /** @type {{result?: {results: Array<{diagnostics: Array<{code: string, suggestion?: string}>}>}, results?: Array<{diagnostics: Array<{code: string, suggestion?: string}>}>}} */ (
      JSON.parse(raw)
    );
  const results = id.startsWith('plan/') ? parsed.results : parsed.result?.results;
  requireMatch(results !== undefined, `${id}: result envelope`);
  const diagnostics = results?.flatMap((row) => row.diagnostics) ?? [];
  const matching = diagnostics.filter(
    (row) => row.code === 'GEOSPEC_BOUNDING_BOX_MISMATCH' && row.suggestion === oldBboxRepair,
  );
  const oldLiteral = JSON.stringify(oldBboxRepair);
  requireMatch(matching.length === 1 && raw.split(oldLiteral).length === 2, `${id}: exact bbox suggestion`);
  return raw.replace(oldLiteral, JSON.stringify(currentBboxRepair));
};

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

/**
 * Project only the serialized numericProfile field; incidental text is not an authority binding.
 * @internal
 * @type {(text: string | undefined, successor: string) => string | undefined}
 */
export const projectNumericProfile = (text, successor) =>
  text?.replaceAll(oldNumericProfileField, `"numericProfile":"${successor}"`);

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
 * @param bindingProfile - Declared constructor configuration, independent of observed output.
 * @param successorBytes - Optional exactly pinned v5 or v6 numeric-profile.txt bytes; omitted keeps the original join.
 * @returns Current inputs/expectations in original order and both authority digests.
 * @internal
 * @type {(originalBytes: Uint8Array, profileBytes: Uint8Array, bindingProfile?: 'core-only' | 'full-backend', successorBytes?: Uint8Array) => Promise<Corpus & { originalSha256: string, profileSha256: string, bindingProfile: 'core-only' | 'full-backend', successorSha256?: string }>}
 */
// oxlint-disable-next-line max-params -- The frozen join accepts two authorities and two explicit profile selectors.
export const joinCurrentCorpus = async (originalBytes, profileBytes, bindingProfile, successorBytes) => {
  bindingProfile ??= 'core-only';
  requireMatch(['core-only', 'full-backend'].includes(bindingProfile), 'binding profile');
  requireMatch((await digest(originalBytes)) === originalSha256, 'original corpus SHA-256');
  requireMatch((await digest(profileBytes)) === profileSha256, 'current profile SHA-256');
  const original = /** @type {LegacyCorpus} */ (JSON.parse(new TextDecoder().decode(originalBytes)));
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
      let { expectedUtf8 } = bound;
      if (bindingProfile === 'full-backend' && record.id === 'a1/raw/initialize') {
        // Full bindings unconditionally compose OCCT and Manifold via runtime create_engine.
        // Replace only these two booleans and append the independently approved
        // exact AP242 capability; retain all other frozen canonical bytes.
        const coreBackends = '"backends":{"brep":false,"csg":false}';
        if (expectedUtf8?.split(coreBackends).length !== 2) {
          throw new Error('Current conformance binding mismatch: core backend presence');
        }
        expectedUtf8 = expectedUtf8.replace(coreBackends, '"backends":{"brep":true,"csg":true}');
        const capabilityEnd = '],"configuration":';
        const minimumCapability =
          '{"implementation":"implemented","name":"minimumDistance","profile":"geospec-minimum-distance-v1","qualification":"unqualified","registryVersion":5,"scope":"declared-subject-profile"}';
        const result = /** @type {{result: {capabilities: Array<{name: string}>}}} */ (JSON.parse(expectedUtf8));
        if (
          expectedUtf8.split(capabilityEnd).length !== 2 ||
          result.result.capabilities.at(-1)?.name !== 'queryPmi' ||
          result.result.capabilities.some(({ name }) => name === 'minimumDistance')
        ) {
          throw new Error('Current conformance binding mismatch: minimum capability baseline');
        }
        expectedUtf8 = expectedUtf8.replace(capabilityEnd, `,${minimumCapability}${capabilityEnd}`);
      }
      return {
        ...record,
        inputUtf8: bound.effectiveInputUtf8,
        inputHex: bound.effectiveInputHex,
        expectedUtf8,
        expectedCode: bound.expectedCode,
        expectedMessage: bound.expectedMessage,
        ingest,
      };
    }),
  );
  const joined = { ...original, meshes, records, originalSha256, profileSha256, bindingProfile };
  if (successorBytes === undefined) {
    return joined;
  }
  const actualSuccessorSha256 = await digest(successorBytes);
  requireMatch(
    actualSuccessorSha256 === successorSha256 || actualSuccessorSha256 === materialSuccessorSha256,
    'v5 or v6 successor SHA-256',
  );
  const successorText = new TextDecoder('utf-8', { fatal: true }).decode(successorBytes);
  requireMatch(
    actualSuccessorSha256 === successorSha256
      ? successorText === 'geospec-demand-v5'
      : successorText === 'geospec-demand-v6\n',
    'successor profile',
  );
  const successor = successorText.trimEnd();
  /** @type {(text: string | undefined) => string | undefined} */
  const project = (text) => projectNumericProfile(text, successor);
  return {
    ...joined,
    successorSha256: actualSuccessorSha256,
    meshes: meshes.map((mesh) => ({
      ...mesh,
      requestUtf8: project(mesh.requestUtf8),
      expectedUtf8: project(mesh.expectedUtf8),
    })),
    records: records.map((record) => {
      if (stringAxisIds.has(record.id)) {
        requireMatch(record.expectedMessage === 'bounding-box axes must be a finite number.', record.id);
      }
      return {
        ...record,
        // Hex inputs remain byte-identical, including malformed UTF-8 controls.
        inputUtf8: project(record.inputUtf8),
        expectedUtf8: project(
          actualSuccessorSha256 === materialSuccessorSha256
            ? projectMaterialRepairSuggestion(record.id, record.expectedUtf8)
            : record.expectedUtf8,
        ),
        expectedMessage: stringAxisIds.has(record.id)
          ? 'GeoSpec numeric expectation must be an object.'
          : record.expectedMessage,
      };
    }),
  };
};

/**
 * Read the separately authored v6 material controls, without projecting old geometry oracles.
 * Every admission is a genuine existing glTF byte ingress, not a synthetic mesh subject.
 * @internal
 * @type {(bytes: Uint8Array) => Promise<Corpus & { materialSha256: string }>}
 */
export const loadMaterialCorpus = async (bytes) => {
  requireMatch((await digest(bytes)) === materialCorpusSha256, 'material corpus SHA-256');
  const corpus = /** @type {Corpus & { authority: { id: string, numericProfile: string } }} */ (
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  );
  requireMatch(
    corpus.schemaVersion === 1 &&
      corpus.authority.id === 'material-v6-01' &&
      corpus.authority.numericProfile === 'geospec-demand-v6',
    'material authority',
  );
  requireMatch(corpus.meshes.length === 20 && corpus.records.length === 46, 'material counts');
  const ids = new Set(corpus.meshes.map((mesh) => mesh.id));
  requireMatch(ids.size === corpus.meshes.length, 'material admission IDs');
  requireMatch(new Set(corpus.records.map((row) => row.id)).size === corpus.records.length, 'material record IDs');
  await Promise.all(
    corpus.meshes.map(async (mesh) => {
      if (mesh.admission !== 'subject' || 'meshHex' in mesh) {
        throw new Error(`Current conformance binding mismatch: ${mesh.id}: subject branch`);
      }
      const primary = input(undefined, mesh.primaryHex);
      requireMatch(
        primary.length === mesh.primaryByteLength &&
          (await digest(primary)) === mesh.primarySha256 &&
          mesh.contentHash === mesh.primarySha256,
        `${mesh.id}: primary bytes`,
      );
      requireMatch(
        (await digest(encoder.encode(mesh.requestUtf8))) === mesh.requestSha256,
        `${mesh.id}: request bytes`,
      );
      requireMatch(
        mesh.resources.length === 1 && new Set(mesh.resources.map((r) => r.name)).size === mesh.resources.length,
        `${mesh.id}: resource names`,
      );
      await Promise.all(
        mesh.resources.map(async (resource) => {
          const resourceBytes = input(undefined, resource.hex);
          requireMatch(
            resourceBytes.length === resource.byteLength && (await digest(resourceBytes)) === resource.sha256,
            `${mesh.id}: resource bytes`,
          );
        }),
      );
      const request =
        /** @type {{ method: string, format: string, primaryByteLength: number, resources: Array<{name: string, byteLength: number}> }} */ (
          JSON.parse(mesh.requestUtf8)
        );
      requireMatch(
        request.method === 'ingestSubject' &&
          request.format === 'gltf' &&
          request.primaryByteLength === primary.length &&
          request.resources.length === mesh.resources.length &&
          request.resources.every(
            (resource, index) =>
              resource.name === mesh.resources[index].name && resource.byteLength === mesh.resources[index].byteLength,
          ),
        `${mesh.id}: ingress request`,
      );
      const expected =
        /** @type {{ result: {subject: {subjectHash: string, descriptor: {primary: {sha256: string, byteLength: number}, resources: Array<{name: string, sha256: string, byteLength: number}>}}}}} */ (
          JSON.parse(mesh.expectedUtf8)
        );
      requireMatch(
        expected.result.subject.subjectHash === mesh.subjectHash &&
          (await digest(encoder.encode(JSON.stringify(expected.result.subject.descriptor)))) === mesh.subjectHash,
        `${mesh.id}: independently pinned subject descriptor`,
      );
      requireMatch(
        expected.result.subject.descriptor.primary.sha256 === mesh.primarySha256 &&
          expected.result.subject.descriptor.primary.byteLength === mesh.primaryByteLength &&
          expected.result.subject.descriptor.resources.every(
            (resource, index) =>
              resource.name === mesh.resources[index].name &&
              resource.sha256 === mesh.resources[index].sha256 &&
              resource.byteLength === mesh.resources[index].byteLength,
          ),
        `${mesh.id}: descriptor resources`,
      );
    }),
  );
  for (const row of corpus.records) {
    requireMatch(row.ingest.length === 1 && row.ingest.every((id) => ids.has(id)), `${row.id}: admission reference`);
    const request = /** @type {{plan: {subjects: Array<{subjectHash: string}>}}} */ (
      JSON.parse(row.inputUtf8 ?? 'null')
    );
    const mesh = corpus.meshes.find((admission) => admission.id === row.ingest[0]);
    requireMatch(
      request.plan.subjects.length === 1 &&
        mesh?.admission === 'subject' &&
        request.plan.subjects[0].subjectHash === mesh.subjectHash,
      `${row.id}: selected subject identity`,
    );
  }
  return { ...corpus, materialSha256: materialCorpusSha256 };
};

/**
 * Resolve an exact ordered allowlist before constructing any engine.
 * Equivalent canonical groups are either wholly selected or wholly omitted.
 * @internal
 * @type {(corpus: Corpus, recordIds?: string[]) => CorpusRecord[]}
 */
export const selectCorpusRecords = (corpus, recordIds) => {
  if (recordIds === undefined) {
    return corpus.records;
  }
  requireMatch(recordIds.length > 0 && new Set(recordIds).size === recordIds.length, 'nonempty unique selection');
  const byId = new Map(corpus.records.map((record) => [record.id, record]));
  const selected = recordIds.map((id) => {
    const record = byId.get(id);
    if (record === undefined) {
      throw new Error(`Unknown conformance record: ${id}`);
    }
    return record;
  });
  const ids = new Set(recordIds);
  for (const group of corpus.equivalentCanonicalGroups) {
    requireMatch(!group.some((id) => ids.has(id)) || group.every((id) => ids.has(id)), 'complete equivalent group');
  }
  return selected;
};
