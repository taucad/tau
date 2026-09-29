/* oxlint-disable jsdoc/no-types, jsdoc-js/no-types -- Plain ESM JavaScript consumers require JSDoc types; no TypeScript annotations can appear in these runtime files. */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

/** @param {string} name Environment key. @returns {string} Required value. */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const tetrahedron = () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
  const bytes = Buffer.alloc(12 + positions.length * 8 + indices.length * 4);
  bytes.write('GSM1');
  bytes.writeUInt32LE(4, 4);
  bytes.writeUInt32LE(4, 8);
  for (const [index, value] of positions.entries()) {
    bytes.writeDoubleLE(value, 12 + index * 8);
  }
  const indicesOffset = 12 + positions.length * 8;
  for (const [index, value] of indices.entries()) {
    bytes.writeUInt32LE(value, indicesOffset + index * 4);
  }
  return bytes;
};

/** @param {Uint8Array<ArrayBuffer>} bytes Public response. @returns {{subject: {subjectHash?: string, contentHash: string}, subjectHandle: unknown}} Admission or handle response. */
const responseResult = (bytes) =>
  /** @type {{result: {subject: {subjectHash?: string, contentHash: string}, subjectHandle: unknown}}} */ (
    JSON.parse(Buffer.from(bytes).toString())
  ).result;

/** @param {Uint8Array<ArrayBuffer>} value Canonical bytes. */
const byteRecord = (value) => ({
  byteLength: value.byteLength,
  sha256: createHash('sha256').update(value).digest('hex'),
  utf8: Buffer.from(value).toString(),
});
/** @param {import('#bench/lib').PublicConsumerReport} report Complete public report. */
const record = (report) => ({
  claimId: report.claimId,
  status: report.status,
  resultStatus: report.result.status,
  canonicalClaim: byteRecord(report.canonicalClaim),
  canonicalPlan: byteRecord(report.canonicalPlan),
  canonicalResult: byteRecord(report.canonicalResult),
  result: report.result,
});
/** @param {string} path Event path.
 * @param {unknown} value Complete event. */
const publish = (path, value) => {
  writeFileSync(`${path}.pending`, JSON.stringify(value));
  renameSync(`${path}.pending`, path);
};

/** @param {import('#bench/lib').BroadWorkloadPlan['subject'] | undefined} source Selected public input. */
const readInputs = (source) => ({
  primary: source ? readFileSync(source.primary.path) : tetrahedron(),
  resources: source?.format === 'gltf' ? source.resources : [],
});

test('emits complete installed Vitest public reports before acknowledgement and cleanup', async () => {
  const binding = /** @type {import('#bench/lib').ProductBinding} */ (
    await import(pathToFileURL(requiredEnvironment('GEOSPEC_EVENT_BINDING')).href)
  );
  const assertion = /** @type {import('#bench/lib').AssertionClientModule} */ (
    await import(pathToFileURL(requiredEnvironment('GEOSPEC_EVENT_ASSERTION_CLIENT')).href)
  );
  const vitestAdapter = /** @type {import('#bench/lib').ProductVitestModule} */ (
    await import(pathToFileURL(requiredEnvironment('GEOSPEC_EVENT_VITEST_ADAPTER')).href)
  );
  const workload = requiredEnvironment('GEOSPEC_WORKLOAD_ID');
  const prepared = /** @type {import('#bench/lib').BroadWorkloadPlan | null} */ (
    JSON.parse(readFileSync(requiredEnvironment('GEOSPEC_PREPARED_WORKLOAD'), 'utf8'))
  );
  const claims = prepared?.claims ?? [
    {
      claimId: 'benchmark-common-tetrahedron-bounds',
      workUnitBudget: 10_000,
      capability: 'toHaveBoundingBox',
      payload: { expected: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, tolerance: 0 } },
    },
  ];
  const source = prepared?.subject;
  const state = /** @type {import('#bench/worker-state').WorkerState} */ (
    JSON.parse(process.env.GEOSPEC_CAMPAIGN_STATE ?? '{"mode":"cold-process"}')
  );
  /** @type {import('#bench/lib').EngineObservation | null} */
  let observationStart = null;
  /** @param {Record<string, unknown>} fields Prepared state metadata. */
  const ready = async (fields) => {
    observationStart = engine.observations
      ? /** @type {import('#bench/lib').EngineObservation} */ (
          JSON.parse(Buffer.from(engine.observations()).toString())
        )
      : null;
    publish(requiredEnvironment('GEOSPEC_EVENT_STATE'), { mode: state.mode, ...fields });
    while (!existsSync(requiredEnvironment('GEOSPEC_EVENT_START'))) {
      // oxlint-disable-next-line no-await-in-loop -- Wait for the parent measurement-start ACK on the prepared live engine.
      await wait(5);
    }
  };
  const cacheOptions = process.env.GEOSPEC_CAMPAIGN_CACHE
    ? /** @type {import('#bench/lib').ProductCacheOptions} */ (JSON.parse(process.env.GEOSPEC_CAMPAIGN_CACHE))
    : undefined;
  const engine = new binding.Engine(cacheOptions);
  /** @type {unknown} */
  let subjectHandle;
  const envelope = { protocolVersion: 3, registryVersion: 5, canonicalProfile: 'geospec-jcs-v1' };
  /** @param {string} method Protocol method.
   * @param {Record<string, unknown>} fields Owned arguments. */
  const request = (method, fields = {}) =>
    Buffer.from(JSON.stringify({ ...envelope, method, requestId: `vitest-event-${method}`, ...fields }));
  try {
    engine.processRequest(request('initialize'));
    if (state.mode === 'warm-engine-cold-subject') {
      await ready({ retainedSubject: false });
    }
    const { primary, resources } = readInputs(source);
    const admission = responseResult(
      source
        ? engine.ingestSubject(
            request('ingestSubject', {
              format: source.format,
              frame: {
                coordinateSystem: 'z-up',
                sourceUnit: source.format === 'step' ? 'auto' : 'mm',
                outputUnit: 'mm',
              },
              ingestOptions: {},
              primaryByteLength: primary.byteLength,
              resources: resources.map((row) => ({ name: basename(row.path), byteLength: row.bytes })),
            }),
            primary,
            resources.map((row) => readFileSync(row.path)),
          )
        : engine.ingestMesh(
            request('ingestSubject', {
              format: 'mesh-buffer-v1',
              contentHash: createHash('sha256').update(primary).digest('hex'),
              frame: { coordinateSystem: 'z-up', unit: 'mm' },
            }),
            primary,
          ),
    );
    const identityField = typeof admission.subject.subjectHash === 'string' ? 'subjectHash' : 'contentHash';
    const subject = { [identityField]: admission.subject[identityField] };
    subjectHandle = responseResult(engine.subjectHandle(request('subjectHandle', subject))).subjectHandle;
    const prior = state.mode === 'incremental-edit' ? state.prior : prepared;
    const prefill = ['resident-warm', 'incremental-edit'].includes(state.mode);
    if (
      prefill &&
      (!prior ||
        prior.subject.primary.sha256 !== prepared.subject.primary.sha256 ||
        JSON.stringify(prior.subject.resources) !== JSON.stringify(prepared.subject.resources))
    ) {
      throw new Error('Prefill requires the same retained artifact.');
    }
    let reports = [];
    for (const measured of prefill ? [false, true] : [true]) {
      reports = [];
      for (const claim of measured ? claims : prior.claims) {
        const client = assertion.createGeoSpecAssertionClient({
          engine,
          canonicalize: binding.canonicalize,
          claimId: () => claim.claimId,
          subjectSlot: 'subject',
          workUnitLimit: claim.workUnitBudget,
        });
        const adapter = vitestAdapter.createGeoSpecVitestAdapter(client);
        /** @type {import('#bench/lib').PublicConsumerReport | undefined} */
        let publicReport;
        if (claim.capability === 'analyzeMeshOverlap') {
          // oxlint-disable-next-line no-await-in-loop -- Execute the authored public query against the same retained subject.
          publicReport = await client.query({
            capability: claim.capability,
            claimId: claim.claimId,
            payload: claim.payload,
            subject,
          });
          expect(['passed', 'failed']).toContain(publicReport.result.status);
        } else {
          const matcher = adapter.matchers[claim.capability];
          if (!matcher) {
            throw new Error(`Selected Vitest adapter requires a public matcher: ${claim.capability}`);
          }
          expect.extend({
            [claim.capability]: async function (...arguments_) {
              const result = await Reflect.apply(matcher, this, arguments_);
              publicReport = result.actual;
              return result;
            },
          });
          try {
            // oxlint-disable-next-line no-await-in-loop -- Preserve the declared serial public assertion workload.
            await /** @type {(value: unknown) => Promise<void>} */ (expect(subject)[claim.capability])(
              /** @type {{expected: unknown}} */ (claim.payload).expected,
            );
          } catch (error) {
            if (publicReport?.status !== 'failed') {
              throw error;
            }
          }
          // oxlint-disable-next-line no-await-in-loop -- Settle this actual matcher before publishing its report.
          await adapter.flush();
          if (publicReport === undefined) {
            throw new Error('Vitest matcher did not return a public report.');
          }
        }
        reports.push(record(publicReport));
        if (measured && reports.length === 1) {
          publish(requiredEnvironment('GEOSPEC_EVENT_REPORT'), {
            workload,
            boundary: 'installed-vitest-public-matcher-settled',
            report: reports[0],
            cleanupStarted: false,
          });
        }
      }
      if (!measured) {
        // oxlint-disable-next-line no-await-in-loop -- Prefill the actual retained subject before the measurement-start ACK.
        await ready({ retainedSubject: true, prefillReports: reports, preparedClaims: prior.claims });
      }
    }
    publish(requiredEnvironment('GEOSPEC_EVENT_SUITE'), { reports, cleanupStarted: false });
    const acknowledgementPath = requiredEnvironment('GEOSPEC_EVENT_ACK');
    while (!existsSync(acknowledgementPath)) {
      // oxlint-disable-next-line no-await-in-loop -- Wait for the suite ACK before ordinary cleanup.
      await wait(5);
    }
    if (readFileSync(acknowledgementPath, 'utf8') !== 'ack') {
      throw new Error('Invalid parent acknowledgement.');
    }
    const observationEnd = engine.observations
      ? /** @type {import('#bench/lib').EngineObservation} */ (
          JSON.parse(Buffer.from(engine.observations()).toString())
        )
      : null;
    engine.releaseSubject(request('releaseSubject', { subjectHandle }));
    subjectHandle = undefined;
    publish(requiredEnvironment('GEOSPEC_EVENT_COMPLETE'), {
      workCounters: { engineReportedConsumedWorkUnits: null, observationStart, observationEnd },
      cache: cacheOptions
        ? {
            producer: /** @type {unknown} */ (JSON.parse(Buffer.from(engine.cacheProducerIdentity()).toString())),
            flush: /** @type {unknown} */ (JSON.parse(Buffer.from(engine.flushCache()).toString())),
          }
        : {},
      kind: 'public-consumer-event',
      workload,
      successful:
        reports.length === claims.length && reports.every((row) => row.status === 'passed' || row.status === 'failed'),
      routeState: 'public-consumer-settled',
      cleanup: { status: 'released', close: 'pending' },
      firstReportAcknowledgedBeforeCleanup: true,
    });
  } finally {
    if (subjectHandle !== undefined) {
      engine.releaseSubject(request('releaseSubject', { subjectHandle }));
    }
    engine.close?.();
  }
});
