/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-plus-operands -- Approved plans, policy, and worker records cross intentionally untyped JSON boundaries. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, sign as cryptoSign, verify } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TRUST_ROOT = dirname(fileURLToPath(import.meta.url));
const PAYLOAD_TYPE = 'application/vnd.in-toto+json';
const PREDICATE_TYPE = 'https://taucad.dev/attestation/geospec-trusted-evaluation/v2';
const MAX_ENVELOPE_BYTES = 4_194_304;
const MAX_ARTIFACT_BYTES = 67_108_864;
const MAX_CANONICAL_BATCH_BYTES = 3 * MAX_ARTIFACT_BYTES;
const RUNNER_FILES = ['canonicalize.mjs', 'evaluate-worker.mjs', 'run.mjs'];
const DARWIN_ARM64_PACKAGE = '@taucad/geospec-engine-native-darwin-arm64';
const DARWIN_ARM64_BINARY = 'geospec-engine-native.darwin-arm64.node';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).toSorted(), keys.toSorted(), `${label} fields`);
};
const safeName = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.match(value, /^[\w./-]+$/, `${label} must be bounded ASCII`);
  assert.ok(!value.startsWith('/') && !value.split('/').includes('..'), `${label} must be relative`);
  return value;
};
const sourcePath = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.match(value, /^[\w./-]+$/, `${label} must be bounded ASCII`);
  assert.ok(!value.startsWith('/'), `${label} must be relative`);
  return value;
};
const pae = (payloadType, payload) =>
  Buffer.concat([
    Buffer.from(`DSSEv1 ${Buffer.byteLength(payloadType)} ${payloadType} ${payload.byteLength} `),
    payload,
  ]);

const controlledEnvironment = (temporaryDirectory) => ({
  LANG: 'C',
  NAPI_RS_ENFORCE_VERSION_CHECK: '1',
  NODE_NO_WARNINGS: '1',
  PATH: dirname(process.execPath),
  TMPDIR: temporaryDirectory,
});

const runCanonicalizer = (productRoot, inputPath, mode) => {
  const arguments_ = [join(TRUST_ROOT, 'canonicalize.mjs'), productRoot, inputPath];
  if (mode) {
    arguments_.push(mode);
  }
  const result = spawnSync(process.execPath, arguments_, {
    encoding: null,
    env: controlledEnvironment(dirname(inputPath)),
    maxBuffer: mode === '--batch' ? MAX_CANONICAL_BATCH_BYTES : MAX_ARTIFACT_BYTES,
    timeout: 10_000,
  });
  assert.equal(result.status, 0, Buffer.from(result.stderr ?? []).toString('utf8'));
  return Buffer.from(result.stdout);
};

const frameJsonRecords = (records) =>
  Buffer.concat(
    records.flatMap((record) => {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(record.byteLength);
      return [header, record];
    }),
  );

const canonicalizeJsonBatch = (productRoot, records) => {
  assert.ok(records.length > 0, 'canonicalization batch must not be empty');
  const directory = mkdtempSync(join(tmpdir(), 'geospec-trust-batch-'));
  const input = join(directory, 'input.bin');
  try {
    writeFileSync(input, frameJsonRecords(records));
    const output = runCanonicalizer(productRoot, input, '--batch');
    const canonical = [];
    let offset = 0;
    while (offset < output.byteLength) {
      assert.ok(offset + 4 <= output.byteLength, 'incomplete canonicalization batch header');
      const byteLength = output.readUInt32BE(offset);
      offset += 4;
      assert.ok(offset + byteLength <= output.byteLength, 'incomplete canonicalization batch value');
      canonical.push(output.subarray(offset, offset + byteLength));
      offset += byteLength;
    }
    assert.equal(canonical.length, records.length, 'canonicalization batch result count');
    return canonical;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

const canonicalizeValue = (productRoot, value) => {
  const directory = mkdtempSync(join(tmpdir(), 'geospec-trust-'));
  const input = join(directory, 'input.json');
  try {
    writeFileSync(input, JSON.stringify(value));
    return runCanonicalizer(productRoot, input);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

const writeCanonical = ({ directory, name, productRoot, value }) => {
  const bytes = canonicalizeValue(productRoot, value);
  const path = join(directory, name);
  writeFileSync(path, bytes);
  return { bytes, path };
};

const validatePlan = (plan) => {
  exactKeys(plan, ['authority', 'claims', 'requirements', 'schema', 'subjects'], 'approved plan');
  assert.equal(plan.schema, 'geospec-approved-evaluation-plan-v2');
  exactKeys(
    plan.authority,
    ['canonicalProfile', 'protocolVersion', 'registryVersion', 'requirementRevision'],
    'authority',
  );
  exactKeys(
    plan.requirements,
    ['freshChallengeRequired', 'maxClaims', 'maxSubjectBytes', 'maxTotalSubjectBytes', 'workerDeadlineMs'],
    'requirements',
  );
  assert.equal(plan.authority.canonicalProfile, 'geospec-jcs-v1');
  assert.equal(plan.authority.protocolVersion, 3);
  assert.equal(plan.authority.registryVersion, 5);
  assert.ok(plan.claims.length > 0 && plan.claims.length <= plan.requirements.maxClaims);
  assert.ok(plan.subjects.length > 0 && plan.subjects.length <= 4);
  assert.equal(new Set(plan.claims.map((entry) => entry.claim.claimId)).size, plan.claims.length);
  assert.equal(new Set(plan.subjects.map((entry) => entry.slot)).size, plan.subjects.length);
  let totalBytes = 0;
  for (const entry of plan.claims) {
    exactKeys(entry, ['canonicalClaimSha256', 'claim'], 'approved claim');
  }
  for (const subject of plan.subjects) {
    exactKeys(
      subject,
      [
        'expectedIdentity',
        'format',
        'frame',
        'identityField',
        'ingestRequest',
        'ingestRequestSha256',
        'primary',
        'resources',
        'slot',
      ],
      'approved subject',
    );
    exactKeys(subject.primary, ['byteLength', 'path', 'sha256'], 'primary descriptor');
    exactKeys(
      subject.ingestRequest,
      [
        'canonicalProfile',
        'format',
        'frame',
        'ingestOptions',
        'method',
        'primaryByteLength',
        'protocolVersion',
        'registryVersion',
        'requestId',
        'resources',
      ],
      'ingest request',
    );
    safeName(subject.slot, 'subject slot');
    sourcePath(subject.primary.path, 'primary path');
    assert.equal(subject.ingestRequest.canonicalProfile, plan.authority.canonicalProfile);
    assert.equal(subject.ingestRequest.protocolVersion, plan.authority.protocolVersion);
    assert.equal(subject.ingestRequest.registryVersion, plan.authority.registryVersion);
    assert.equal(subject.ingestRequest.method, 'ingestSubject');
    assert.equal(subject.ingestRequest.format, subject.format);
    assert.deepEqual(subject.ingestRequest.frame, subject.frame);
    assert.equal(subject.ingestRequest.primaryByteLength, subject.primary.byteLength);
    assert.ok(subject.primary.byteLength <= plan.requirements.maxSubjectBytes);
    totalBytes += subject.primary.byteLength;
    for (const resource of subject.resources) {
      exactKeys(resource, ['byteLength', 'name', 'path', 'sha256'], 'resource descriptor');
      safeName(resource.name, 'resource name');
      sourcePath(resource.path, 'resource path');
      assert.ok(resource.byteLength <= plan.requirements.maxSubjectBytes);
      totalBytes += resource.byteLength;
    }
    assert.deepEqual(
      subject.ingestRequest.resources,
      subject.resources.map(({ byteLength, name }) => ({ byteLength, name })),
      'ingest resource descriptors',
    );
  }
  assert.ok(totalBytes <= plan.requirements.maxTotalSubjectBytes);
};

const copyBoundFile = ({ destinationPath, expected, planRoot, requestedSourcePath }) => {
  const source = resolve(planRoot, sourcePath(requestedSourcePath, 'subject source path'));
  const bytes = readFileSync(source);
  assert.equal(bytes.byteLength, expected.byteLength, `${requestedSourcePath} byte length`);
  assert.equal(sha256(bytes), expected.sha256, `${requestedSourcePath} digest`);
  mkdirSync(dirname(destinationPath), { recursive: true });
  copyFileSync(source, destinationPath);
  return destinationPath;
};

const artifact = (root, name) => {
  safeName(name, 'artifact name');
  const path = join(root, name);
  const metadata = statSync(path);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${name} must be a regular file`);
  assert.ok(metadata.size <= MAX_ARTIFACT_BYTES, `${name} exceeds artifact limit`);
  return { byteLength: metadata.size, name, sha256: sha256(readFileSync(path)) };
};

const installedEngineFiles = (productRoot) => {
  assert.equal(process.platform, 'darwin', 'trusted evaluator currently requires Darwin');
  assert.equal(process.arch, 'arm64', 'trusted evaluator currently requires Darwin ARM64');
  const packagePath = join(productRoot, 'node_modules/@taucad/geospec-engine-native/package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(packageJson.optionalDependencies?.[DARWIN_ARM64_PACKAGE], packageJson.version);
  const localNativeDirectory = join(productRoot, 'node_modules/@taucad/geospec-engine-native/dist/native');
  assert.deepEqual(
    readdirSync(localNativeDirectory).filter((entry) => entry.endsWith('.node')),
    [],
    'local native loader alternatives must be absent',
  );
  const loaderRequire = createRequire(realpathSync(join(localNativeDirectory, 'index.js')));
  let universalCandidate;
  try {
    universalCandidate = loaderRequire.resolve('@taucad/geospec-engine-native-darwin-universal');
  } catch (error) {
    assert.equal(error.code, 'MODULE_NOT_FOUND', 'universal candidate resolution');
  }
  assert.equal(universalCandidate, undefined, 'Darwin universal loader alternative must not resolve');
  const platformDirectory = join(productRoot, 'node_modules', DARWIN_ARM64_PACKAGE);
  assert.equal(
    realpathSync(loaderRequire.resolve(DARWIN_ARM64_PACKAGE)),
    realpathSync(join(platformDirectory, DARWIN_ARM64_BINARY)),
    'resolved native binary must match the engine manifest',
  );
  assert.equal(
    realpathSync(loaderRequire.resolve(`${DARWIN_ARM64_PACKAGE}/package.json`)),
    realpathSync(join(platformDirectory, 'package.json')),
    'resolved platform package must match the engine manifest',
  );
  const platformPackageJson = JSON.parse(readFileSync(join(platformDirectory, 'package.json'), 'utf8'));
  assert.equal(platformPackageJson.name, DARWIN_ARM64_PACKAGE);
  assert.equal(platformPackageJson.version, packageJson.version);
  assert.equal(platformPackageJson.main, DARWIN_ARM64_BINARY);
  assert.deepEqual(
    readdirSync(platformDirectory).filter((entry) => entry.endsWith('.node')),
    [DARWIN_ARM64_BINARY],
    'Darwin ARM64 package must contain exactly the selected binary',
  );
  return {
    files: [
      'node_modules/@taucad/geospec-engine-native/package.json',
      'node_modules/@taucad/geospec-engine-native/dist/host-types.mjs',
      'node_modules/@taucad/geospec-engine-native/dist/node.mjs',
      'node_modules/@taucad/geospec-engine-native/dist/native/index.js',
      `node_modules/${DARWIN_ARM64_PACKAGE}/package.json`,
      `node_modules/${DARWIN_ARM64_PACKAGE}/${DARWIN_ARM64_BINARY}`,
    ],
    packageJson,
    platformPackage: DARWIN_ARM64_PACKAGE,
  };
};

const createEngineManifest = (productRoot) => {
  const { files, packageJson, platformPackage } = installedEngineFiles(productRoot);
  const retainedArtifacts = files.map((sourceName) => {
    const bytes = readFileSync(join(productRoot, sourceName));
    return {
      byteLength: bytes.byteLength,
      name: `engine/${sourceName.replace('node_modules/@taucad/', '')}`,
      sha256: sha256(bytes),
      sourceName,
    };
  });
  const nodePath = realpathSync(process.execPath);
  return {
    manifest: {
      package: { name: packageJson.name, version: packageJson.version },
      platformPackage,
      retainedArtifacts: retainedArtifacts.map(({ sourceName: _sourceName, ...entry }) => entry),
      runtimeObservation: {
        byteLength: statSync(nodePath).size,
        node: process.version,
        sha256: sha256(readFileSync(nodePath)),
      },
      schema: 'geospec-engine-artifact-manifest-v2',
    },
    retainedArtifacts,
  };
};

const createRunnerManifest = () => ({
  retainedArtifacts: RUNNER_FILES.map((sourceName) => {
    const bytes = readFileSync(join(TRUST_ROOT, sourceName));
    return {
      byteLength: bytes.byteLength,
      name: `runner/${sourceName}`,
      sha256: sha256(bytes),
      sourceName,
    };
  }),
  schema: 'geospec-evaluator-runner-manifest-v1',
});

const loadPlan = (productRoot, planPath) => {
  const approvedSource = readFileSync(planPath);
  assert.ok(approvedSource.byteLength <= 1024 * 1024, 'approved plan exceeds limit');
  const planBytes = runCanonicalizer(productRoot, planPath);
  const plan = JSON.parse(planBytes);
  validatePlan(plan);
  const canonicalControls = canonicalizeJsonBatch(productRoot, [
    ...plan.claims.map(({ claim }) => Buffer.from(JSON.stringify(claim))),
    ...plan.subjects.map(({ ingestRequest }) => Buffer.from(JSON.stringify(ingestRequest))),
  ]);
  for (const [index, approved] of plan.claims.entries()) {
    assert.equal(sha256(canonicalControls[index]), approved.canonicalClaimSha256);
  }
  for (const [index, subject] of plan.subjects.entries()) {
    assert.equal(sha256(canonicalControls[plan.claims.length + index]), subject.ingestRequestSha256);
  }
  return { approvedSource, plan, planBytes };
};

/** Derive the immutable identities that an evaluation authority must pin. @public */
export const describeTrustedInputs = ({ productRoot: requestedProductRoot, planPath: requestedPlanPath }) => {
  const productRoot = resolve(requestedProductRoot);
  const planPath = resolve(requestedPlanPath);
  assert.ok(existsSync(productRoot), 'installed product is missing');
  const { plan, planBytes } = loadPlan(productRoot, planPath);
  const engine = createEngineManifest(productRoot);
  const runner = createRunnerManifest();
  const engineBytes = canonicalizeValue(productRoot, engine.manifest);
  const runnerManifest = {
    retainedArtifacts: runner.retainedArtifacts.map(({ sourceName: _sourceName, ...entry }) => entry),
    schema: runner.schema,
  };
  const runnerBytes = canonicalizeValue(productRoot, runnerManifest);
  return {
    approvedPlanSha256: sha256(planBytes),
    canonicalProfile: plan.authority.canonicalProfile,
    engineManifestSha256: sha256(engineBytes),
    expectedClaimIds: plan.claims.map((entry) => entry.claim.claimId),
    expectedSubjects: plan.subjects
      .flatMap((subject) => [
        { name: `subjects/${subject.slot}/primary.${subject.format}`, sha256: subject.primary.sha256 },
        ...subject.resources.map((resource) => ({
          name: `subjects/${subject.slot}/resources/${resource.name}`,
          sha256: resource.sha256,
        })),
      ])
      .toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
    protocolVersion: plan.authority.protocolVersion,
    registryVersion: plan.authority.registryVersion,
    requirementRevision: plan.authority.requirementRevision,
    requireFreshChallenge: plan.requirements.freshChallengeRequired,
    runnerManifestSha256: sha256(runnerBytes),
  };
};

const validatePolicy = (policy, described, jobChallenge) => {
  exactKeys(
    policy,
    [
      'approvedPlanSha256',
      'cacheMode',
      'canonicalProfile',
      'engineManifestSha256',
      'evaluatorId',
      'evaluatorMode',
      'expectedClaimIds',
      'expectedJobChallenge',
      'expectedSubjects',
      'maxArtifactBytes',
      'maxEnvelopeBytes',
      'numericProfile',
      'payloadType',
      'predicateType',
      'protocolVersion',
      'publicKeyPem',
      'registryVersion',
      'requireFreshChallenge',
      'requirementRevision',
      'runnerManifestSha256',
      'schema',
      'trustedKeyId',
    ],
    'verification policy',
  );
  assert.equal(policy.schema, 'geospec-trusted-verifier-policy-v2');
  assert.deepEqual(
    {
      approvedPlanSha256: policy.approvedPlanSha256,
      canonicalProfile: policy.canonicalProfile,
      engineManifestSha256: policy.engineManifestSha256,
      expectedClaimIds: policy.expectedClaimIds,
      expectedSubjects: policy.expectedSubjects,
      protocolVersion: policy.protocolVersion,
      registryVersion: policy.registryVersion,
      requirementRevision: policy.requirementRevision,
      requireFreshChallenge: policy.requireFreshChallenge,
      runnerManifestSha256: policy.runnerManifestSha256,
    },
    described,
    'pinned policy input binding',
  );
  assert.equal(policy.cacheMode, 'disabled');
  assert.equal(policy.payloadType, PAYLOAD_TYPE);
  assert.equal(policy.predicateType, PREDICATE_TYPE);
  assert.equal(policy.maxArtifactBytes, MAX_ARTIFACT_BYTES);
  assert.equal(policy.maxEnvelopeBytes, MAX_ENVELOPE_BYTES);
  assert.equal(policy.expectedJobChallenge, jobChallenge);
  assert.match(policy.evaluatorId, /^[\w.:-]{1,128}$/);
  assert.match(policy.evaluatorMode, /^[\w.:-]{1,128}$/);
};

const decodeRecordBytes = (entry) => {
  exactKeys(entry, ['base64', 'sha256'], 'canonical byte record');
  const bytes = Buffer.from(entry.base64, 'base64');
  assert.equal(sha256(bytes), entry.sha256);
  return bytes;
};

const validateCompleteRecord = (record, plan, productRoot) => {
  exactKeys(
    record,
    ['cache', 'canonicalPlan', 'canonicalResult', 'complete', 'initialization', 'rows', 'schema', 'subjects'],
    'raw evaluation',
  );
  assert.equal(record.schema, 'geospec-trusted-native-evaluation-v2');
  assert.equal(record.complete, true);
  assert.deepEqual(record.cache, { mode: 'disabled', persistent: false });
  assert.equal(record.initialization.canonicalProfile, plan.authority.canonicalProfile);
  assert.equal(record.initialization.protocolVersion, plan.authority.protocolVersion);
  assert.equal(record.initialization.registryVersion, plan.authority.registryVersion);
  exactKeys(
    record.initialization,
    ['base64', 'canonicalProfile', 'numericProfile', 'protocolVersion', 'registryVersion', 'sha256'],
    'initialization record',
  );
  const initializationResponse = JSON.parse(
    decodeRecordBytes({ base64: record.initialization.base64, sha256: record.initialization.sha256 }),
  );
  assert.equal(initializationResponse.requestId, 'trusted-evaluator-initialize');
  assert.equal(initializationResponse.result.canonicalProfile, record.initialization.canonicalProfile);
  assert.equal(initializationResponse.result.numericProfile, record.initialization.numericProfile);
  assert.equal(initializationResponse.result.protocolVersion, record.initialization.protocolVersion);
  assert.equal(initializationResponse.result.registryVersion, record.initialization.registryVersion);
  const canonicalPlanBytes = decodeRecordBytes(record.canonicalPlan);
  const canonicalResultBytes = decodeRecordBytes(record.canonicalResult);
  const canonicalPlan = JSON.parse(canonicalPlanBytes);
  const canonicalResult = JSON.parse(canonicalResultBytes);
  assert.equal(canonicalPlan.canonicalProfile, plan.authority.canonicalProfile);
  assert.equal(canonicalPlan.protocolVersion, plan.authority.protocolVersion);
  assert.equal(canonicalPlan.registryVersion, plan.authority.registryVersion);
  assert.equal(canonicalPlan.numericProfile, record.initialization.numericProfile);
  assert.equal(canonicalResult.numericProfile, record.initialization.numericProfile);
  assert.deepEqual(
    canonicalPlan.plan.subjects,
    plan.subjects.map((subject) => ({
      slot: subject.slot,
      [subject.identityField]: subject.expectedIdentity,
    })),
  );
  assert.deepEqual(
    canonicalPlan.plan.claims,
    plan.claims.map(({ claim }) => claim),
  );
  assert.equal(record.rows.length, plan.claims.length);
  assert.equal(record.subjects.length, plan.subjects.length);
  assert.deepEqual(
    record.rows.map((row) => row.claimId),
    plan.claims.map((entry) => entry.claim.claimId),
  );
  assert.deepEqual(
    record.rows.map((row) => row.canonicalClaimSha256),
    plan.claims.map((entry) => entry.canonicalClaimSha256),
  );
  assert.ok(record.rows.every((row) => ['passed', 'failed', 'refused'].includes(row.status)));
  assert.equal(canonicalResult.results.length, plan.claims.length);
  const rowBytes = record.rows.map((row) => ({
    claim: Buffer.from(row.canonicalClaim, 'base64'),
    result: Buffer.from(row.canonicalResult, 'base64'),
  }));
  const ingestRequestBytes = record.subjects.map(({ ingestRequest }) => decodeRecordBytes(ingestRequest));
  const canonicalized = canonicalizeJsonBatch(productRoot, [
    canonicalPlanBytes,
    canonicalResultBytes,
    ...rowBytes.flatMap(({ claim, result }) => [claim, result]),
    ...ingestRequestBytes,
  ]);
  assert.deepEqual(canonicalPlanBytes, canonicalized[0]);
  assert.deepEqual(canonicalResultBytes, canonicalized[1]);
  for (const [ordinal, approved] of plan.claims.entries()) {
    const row = record.rows[ordinal];
    const claim = canonicalPlan.plan.claims[ordinal];
    const result = canonicalResult.results[ordinal];
    const { claim: claimBytes, result: resultBytes } = rowBytes[ordinal];
    assert.equal(row.ordinal, ordinal);
    assert.equal(row.claimId, approved.claim.claimId);
    assert.equal(row.claimId, claim.claimId);
    assert.equal(row.claimId, result.claimId);
    assert.equal(row.polarity, approved.claim.polarity);
    assert.equal(row.polarity, claim.polarity);
    assert.equal(row.status, result.status);
    assert.ok(['passed', 'failed', 'refused'].includes(result.status));
    assert.equal(sha256(claimBytes), row.canonicalClaimSha256);
    assert.equal(row.canonicalClaimSha256, approved.canonicalClaimSha256);
    assert.equal(sha256(resultBytes), row.canonicalResultSha256);
    assert.deepEqual(JSON.parse(claimBytes), claim);
    assert.deepEqual(JSON.parse(resultBytes), result);
    assert.deepEqual(claimBytes, canonicalized[2 + ordinal * 2]);
    assert.deepEqual(resultBytes, canonicalized[3 + ordinal * 2]);
  }
  for (const [index, subject] of plan.subjects.entries()) {
    const observed = record.subjects[index];
    exactKeys(observed, ['actualIdentity', 'admission', 'identityField', 'ingestRequest', 'slot'], 'subject record');
    assert.equal(observed.slot, subject.slot);
    assert.equal(observed.actualIdentity, subject.expectedIdentity);
    assert.equal(observed.identityField, subject.identityField);
    const observedIngestRequestBytes = ingestRequestBytes[index];
    assert.equal(observed.ingestRequest.sha256, subject.ingestRequestSha256);
    assert.deepEqual(observedIngestRequestBytes, canonicalized[2 + plan.claims.length * 2 + index]);
    const admission = JSON.parse(decodeRecordBytes(observed.admission));
    assert.equal(admission.requestId, subject.ingestRequest.requestId);
    const admitted = admission.result.subject;
    assert.equal(admitted[subject.identityField], subject.expectedIdentity);
    assert.equal(admitted.format, subject.format);
    assert.equal(admitted.descriptor.format, subject.format);
    assert.equal(admitted.descriptor.primary.byteLength, subject.primary.byteLength);
    assert.equal(admitted.descriptor.primary.sha256, subject.primary.sha256);
    assert.deepEqual(
      admitted.descriptor.resources,
      subject.resources.map(({ byteLength, name, sha256: digest }) => ({ byteLength, name, sha256: digest })),
    );
  }
  return { canonicalPlanBytes, canonicalResultBytes, validationCanonicalizerChildren: 1 };
};

/** Evaluate an approved plan and sign its complete joined native result. @public */
export const evaluateTrustedPlan = async ({
  jobChallenge,
  outputDirectory: requestedOutput,
  planPath: requestedPlanPath,
  productRoot: requestedProductRoot,
  signer,
  verificationPolicy: policy,
}) => {
  assert.match(jobChallenge, /^[\w.:-]{1,128}$/, 'job challenge must be bounded ASCII');
  assert.ok(signer && typeof signer.sign === 'function', 'signer.sign is required');
  const productRoot = resolve(requestedProductRoot);
  const planPath = resolve(requestedPlanPath);
  const output = resolve(requestedOutput);
  assert.ok(!existsSync(output), 'output directory must not already exist');
  const described = describeTrustedInputs({ planPath, productRoot });
  validatePolicy(policy, described, jobChallenge);
  const publicKey = createPublicKey(policy.publicKeyPem);
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(sha256(publicDer), policy.trustedKeyId, 'trusted key ID');

  const closure = join(output, 'closure');
  mkdirSync(closure, { recursive: true, mode: 0o700 });
  const { approvedSource, plan, planBytes } = loadPlan(productRoot, planPath);
  assert.equal(sha256(planBytes), policy.approvedPlanSha256, 'second approved plan load');
  writeFileSync(join(closure, 'plan.json'), planBytes);
  const planRoot = dirname(planPath);
  const workerSubjects = [];
  const subjectArtifactNames = [];
  for (const subject of plan.subjects) {
    const primaryName = `subjects/${subject.slot}/primary.${subject.format}`;
    const primaryPath = copyBoundFile({
      destinationPath: join(closure, primaryName),
      expected: subject.primary,
      planRoot,
      requestedSourcePath: subject.primary.path,
    });
    const resourcePaths = subject.resources.map((resource) => {
      const name = `subjects/${subject.slot}/resources/${safeName(resource.name, 'resource name')}`;
      subjectArtifactNames.push(name);
      return {
        name: resource.name,
        path: copyBoundFile({
          destinationPath: join(closure, name),
          expected: resource,
          planRoot,
          requestedSourcePath: resource.path,
        }),
      };
    });
    subjectArtifactNames.push(primaryName);
    workerSubjects.push({ primaryPath, resourcePaths, slot: subject.slot });
  }

  const engine = createEngineManifest(productRoot);
  for (const entry of engine.retainedArtifacts) {
    const destination = join(closure, entry.name);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(productRoot, entry.sourceName), destination);
  }
  const { bytes: engineBytes } = writeCanonical({
    directory: closure,
    name: 'engine.json',
    productRoot,
    value: engine.manifest,
  });

  const runner = createRunnerManifest();
  for (const entry of runner.retainedArtifacts) {
    const destination = join(closure, entry.name);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(TRUST_ROOT, entry.sourceName), destination);
  }
  const runnerManifest = {
    retainedArtifacts: runner.retainedArtifacts.map(({ sourceName: _sourceName, ...entry }) => entry),
    schema: runner.schema,
  };
  const { bytes: runnerBytes } = writeCanonical({
    directory: closure,
    name: 'runner.json',
    productRoot,
    value: runnerManifest,
  });
  assert.equal(sha256(engineBytes), policy.engineManifestSha256, 'pinned engine manifest');
  assert.equal(sha256(runnerBytes), policy.runnerManifestSha256, 'pinned runner manifest');

  const workerConfigPath = join(output, 'worker-config.json');
  writeFileSync(
    workerConfigPath,
    `${JSON.stringify({ planPath: join(closure, 'plan.json'), productRoot, subjects: workerSubjects }, null, 2)}\n`,
  );
  const worker = spawnSync(process.execPath, [join(TRUST_ROOT, 'evaluate-worker.mjs'), workerConfigPath], {
    cwd: output,
    encoding: null,
    env: controlledEnvironment(output),
    maxBuffer: MAX_ARTIFACT_BYTES,
    timeout: plan.requirements.workerDeadlineMs,
  });
  writeFileSync(join(output, 'worker.stderr'), worker.stderr ?? Buffer.alloc(0));
  assert.equal(worker.status, 0, Buffer.from(worker.stderr ?? []).toString('utf8'));
  assert.ok(worker.stdout && worker.stdout.byteLength > 0, 'worker produced no record');
  writeFileSync(join(closure, 'raw-evaluation.json'), worker.stdout);
  assert.deepEqual(runCanonicalizer(productRoot, join(closure, 'raw-evaluation.json')), Buffer.from(worker.stdout));
  const record = JSON.parse(worker.stdout);
  const { canonicalPlanBytes, canonicalResultBytes, validationCanonicalizerChildren } = validateCompleteRecord(
    record,
    plan,
    productRoot,
  );
  assert.equal(validationCanonicalizerChildren, 1);
  assert.equal(record.initialization.numericProfile, policy.numericProfile, 'pinned numeric profile');

  writeFileSync(join(closure, 'canonical-plan.json'), canonicalPlanBytes);
  writeFileSync(join(closure, 'canonical-result.json'), canonicalResultBytes);

  const runnerNames = runnerManifest.retainedArtifacts.map(({ name }) => name);
  const engineNames = engine.manifest.retainedArtifacts.map(({ name }) => name);
  const closureNames = [
    'plan.json',
    ...subjectArtifactNames.toSorted(),
    ...engineNames,
    'engine.json',
    ...runnerNames,
    'runner.json',
    'canonical-plan.json',
    'canonical-result.json',
    'raw-evaluation.json',
  ];
  const artifacts = closureNames.map((name) => artifact(closure, name));
  const subjectRecords = subjectArtifactNames.toSorted().map((name) => artifact(closure, name));
  const expectedClaimIds = plan.claims.map((entry) => entry.claim.claimId);
  const inventory = record.rows.map((row) => ({
    canonicalClaimSha256: row.canonicalClaimSha256,
    canonicalResultSha256: row.canonicalResultSha256,
    claimId: row.claimId,
    ordinal: row.ordinal,
    polarity: row.polarity,
    status: row.status,
  }));
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    predicate: {
      artifacts,
      assurance: {
        geometryTruth: 'trusted-evaluator-assertion',
        heldSecurityEvaluation: 'open-s10',
        scope: 'authenticated-complete-record-not-independent-geometry-proof',
      },
      cache: { mode: 'disabled', persistent: false },
      claims: { count: expectedClaimIds.length, expectedClaimIds, inventory },
      complete: true,
      engine: {
        manifestSha256: sha256(engineBytes),
        packageName: engine.manifest.package.name,
        packageVersion: engine.manifest.package.version,
      },
      evaluator: { id: policy.evaluatorId, mode: policy.evaluatorMode },
      profiles: {
        canonical: plan.authority.canonicalProfile,
        numeric: record.initialization.numericProfile,
        protocolVersion: record.initialization.protocolVersion,
        registryVersion: record.initialization.registryVersion,
      },
      requirements: {
        approvedPlanSha256: sha256(planBytes),
        approvedPlanSourceSha256: sha256(approvedSource),
        requirementRevision: plan.authority.requirementRevision,
      },
      run: { freshChallengeRequired: plan.requirements.freshChallengeRequired, jobChallenge },
      runner: { manifestSha256: sha256(runnerBytes) },
      schema: 'geospec-trusted-evaluation-predicate-v2',
      subjects: plan.subjects.map((subject) => ({
        expectedIdentity: subject.expectedIdentity,
        format: subject.format,
        frame: subject.frame,
        identityField: subject.identityField,
        primarySha256: subject.primary.sha256,
        resourceSha256: subject.resources.map((resource) => resource.sha256),
        slot: subject.slot,
      })),
    },
    predicateType: PREDICATE_TYPE,
    subject: subjectRecords.map(({ name, sha256: digest }) => ({ digest: { sha256: digest }, name })),
  };
  const statementRecord = writeCanonical({
    directory: output,
    name: 'statement.json',
    productRoot,
    value: statement,
  });
  const signedBytes = pae(PAYLOAD_TYPE, statementRecord.bytes);
  const signature = Buffer.from(await signer.sign(signedBytes));
  assert.ok(verify(null, signedBytes, publicKey, signature), 'signer does not match pinned public key');
  const envelope = {
    payload: statementRecord.bytes.toString('base64'),
    payloadType: PAYLOAD_TYPE,
    signatures: [{ keyid: policy.trustedKeyId, sig: signature.toString('base64') }],
  };
  const envelopeRecord = writeCanonical({
    directory: output,
    name: 'envelope.json',
    productRoot,
    value: envelope,
  });
  assert.ok(envelopeRecord.bytes.byteLength <= MAX_ENVELOPE_BYTES);
  writeFileSync(join(output, 'policy.json'), canonicalizeValue(productRoot, policy));
  const summary = {
    artifacts: artifacts.length,
    cacheMode: 'disabled',
    claims: inventory,
    envelopeSha256: sha256(envelopeRecord.bytes),
    scope: 'authenticated-complete-record-not-independent-geometry-proof',
    statementSha256: sha256(statementRecord.bytes),
  };
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return { output, ...summary };
};

const runCli = async () => {
  const requestPath = process.argv[2];
  assert.ok(requestPath, 'Usage: node run.mjs <evaluation-request.json>');
  const absoluteRequestPath = resolve(requestPath);
  const requestRoot = dirname(absoluteRequestPath);
  const request = JSON.parse(readFileSync(absoluteRequestPath, 'utf8'));
  exactKeys(
    request,
    [
      'jobChallenge',
      'outputDirectory',
      'planPath',
      'privateKeyPath',
      'productRoot',
      'schema',
      'verificationPolicyPath',
    ],
    'evaluation request',
  );
  assert.equal(request.schema, 'geospec-trusted-evaluation-request-v1');
  const resolveRequestPath = (value) => resolve(requestRoot, value);
  const verificationPolicy = JSON.parse(readFileSync(resolveRequestPath(request.verificationPolicyPath), 'utf8'));
  const result = await evaluateTrustedPlan({
    jobChallenge: request.jobChallenge,
    outputDirectory: resolveRequestPath(request.outputDirectory),
    planPath: resolveRequestPath(request.planPath),
    productRoot: resolveRequestPath(request.productRoot),
    signer: {
      sign: (bytes) => cryptoSign(null, bytes, readFileSync(resolveRequestPath(request.privateKeyPath))),
    },
    verificationPolicy,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}
