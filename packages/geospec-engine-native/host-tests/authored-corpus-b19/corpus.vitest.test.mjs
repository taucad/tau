import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createGeoSpecAssertionClient } from '@taucad/geospec/assertion-client';
import { createGeoSpecVitestAdapter } from '@taucad/geospec/vitest';
import { Engine, canonicalize } from '@taucad/geospec-engine-native/node';
import { expect, it } from 'vitest';

/* oxlint-disable no-restricted-imports -- The frozen standalone consumer copies these sibling modules; workspace aliases are unavailable there. */
import {
  admitSubject,
  compareOutcome,
  createForwardingRecorder,
  errorRecord,
  loadAuthoringMap,
  restoreJavascriptArguments,
  writeJson,
} from './corpus.mjs';
/* oxlint-enable no-restricted-imports */

/** @type {(bytes: import('./corpus.mjs').HostBytes) => import('./corpus.mjs').ByteRecord} */
const utf8Record = (bytes) => {
  const value = Buffer.from(bytes);
  return {
    byteLength: value.byteLength,
    sha256: createHash('sha256').update(value).digest('hex'),
    utf8: value.toString('utf8'),
  };
};

/**
 * Decode the installed native protocol's returned envelopes without changing
 * their bytes. The recorder only stores successful returned bytes here.
 * @type {(row: import('./corpus.mjs').AuthoredRow, calls: import('./corpus.mjs').RecordedCall[]) => import('./corpus.mjs').RecordedReport | null}
 */
const reportFromRecorder = (row, calls) => {
  const planCall = calls.find((call) => call.operation === 'canonicalPlan' && call.output);
  const resultCall = calls.find((call) => call.operation === 'evaluatePlan' && call.output);
  if (!planCall || !resultCall) {
    return null;
  }
  const plan = /** @type {import('./corpus.mjs').PlanEnvelope} */ (
    JSON.parse(/** @type {!import('./corpus.mjs').ByteRecord} */ (planCall.output).utf8)
  );
  const resultEnvelope =
    /** @type {{results: [import('./corpus.mjs').NativeReport['result'] & {claimId: string, status: string, diagnostics: import('./corpus.mjs').JsonValue[]}]}} */ (
      JSON.parse(/** @type {!import('./corpus.mjs').ByteRecord} */ (resultCall.output).utf8)
    );
  const claim = plan.plan.claims[0];
  const result = resultEnvelope.results[0];
  return {
    canonicalClaim: utf8Record(canonicalize(Buffer.from(JSON.stringify(claim)))),
    canonicalPlan: /** @type {!import('./corpus.mjs').ByteRecord} */ (planCall.output),
    canonicalResult: /** @type {!import('./corpus.mjs').ByteRecord} */ (resultCall.output),
    claim,
    claimId: result.claimId,
    diagnostics: result.diagnostics,
    evidence: result['evidence'] ?? null,
    polarity: row.polarity,
    result,
    status: result.status,
  };
};

it('should invoke every approved matcher row through the installed Vitest adapter', async () => {
  const map = loadAuthoringMap();
  const output = {
    schemaVersion: 1,
    taskId: map.taskId,
    route: 'javascript-vitest',
    rows: /** @type {import('./corpus.mjs').Outcome[]} */ ([]),
    typedAssertionGaps: /** @type {{id: string, status: string}[]} */ ([]),
    ancillaryGaps: map.rows
      .filter((row) => !row.matcher)
      .map((row) => ({
        id: row.id,
        capability: row.capability,
        reason: 'The installed Vitest adapter registers the 24 matcher descriptors and no ancillary operations.',
      })),
  };

  try {
    for (const row of map.rows.filter((candidate) => candidate.matcher)) {
      const nativeEngine = new Engine();
      let admission;
      let admissionError;
      try {
        admission = admitSubject(nativeEngine, row);
      } catch (error) {
        admissionError = errorRecord(error);
      }
      if (!admission) {
        /** @type {import('./corpus.mjs').Outcome & {recorderCalls: import('./corpus.mjs').RecordedCall[]}} */
        const outcome = {
          id: row.id,
          route: 'javascript-vitest',
          routeState: 'admission-error',
          admission: null,
          authoring: row.authoring.javascript,
          argumentsProtocolJson: row.authoring.argumentsProtocolJson,
          recorderCalls: [],
          error: admissionError,
          report: null,
        };
        outcome.comparison = compareOutcome(row, outcome);
        output.rows.push(outcome);
        continue;
      }
      const recorder = createForwardingRecorder(nativeEngine);
      const client =
        /** @type {typeof import('../../../geospec/src/assertion-client/client.js').createGeoSpecAssertionClient} */ (
          createGeoSpecAssertionClient
        )({
          engine: recorder.engine,
          canonicalize,
          claimId: () => row.claimId,
          subjectSlot: row.subjectSlot,
          workUnitLimit: row.workUnitBudget,
        });
      const adapter =
        /** @type {typeof import('../../../geospec/src/vitest/adapter.js').createGeoSpecVitestAdapter} */ (
          createGeoSpecVitestAdapter
        )(client);
      expect.extend(adapter.matchers);
      const chain = row.polarity === 'negative' ? expect(admission.subject).not : expect(admission.subject);
      let invocationError;
      let flushError;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Await this registered matcher before replacing the shared Vitest matcher registration for the next row.
        await Reflect.apply(
          /** @type {(...arguments_: unknown[]) => Promise<void>} */ (
            chain[/** @type {import('./corpus.mjs').MatcherName} */ (row.capability)]
          ),
          chain,
          restoreJavascriptArguments(row),
        );
      } catch (error) {
        invocationError = errorRecord(error);
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Capture this row's queued protocol errors before moving to the next owner-thread engine.
        await adapter.flush();
      } catch (error) {
        flushError = errorRecord(error);
      }
      /** @type {import('./corpus.mjs').ErrorRecord | undefined} */
      const failure = flushError ?? invocationError;
      const report = reportFromRecorder(row, recorder.calls);
      if (report?.status === 'passed') {
        assert.equal(failure, undefined);
      } else if (report) {
        const typedAssertionObserved = [invocationError, flushError].some(
          (candidate) =>
            candidate?.name === 'AssertionError' ||
            candidate?.constructorName === 'AssertionError' ||
            candidate?.constructorName === 'JestExtendError' ||
            candidate?.isGeoSpecAssertionError,
        );
        if (!typedAssertionObserved) {
          output.typedAssertionGaps.push({ id: row.id, status: report.status });
        }
      }
      /** @type {import('./corpus.mjs').Outcome & {recorderCalls: import('./corpus.mjs').RecordedCall[], invocationError: import('./corpus.mjs').ErrorRecord | null, flushError: import('./corpus.mjs').ErrorRecord | null}} */
      const outcome = {
        id: row.id,
        route: 'javascript-vitest',
        admission,
        authoring: row.authoring.javascript,
        argumentsProtocolJson: row.authoring.argumentsProtocolJson,
        recorderCalls: recorder.calls,
        invocationError: invocationError ?? null,
        flushError: flushError ?? null,
        error: failure ?? null,
        report,
      };
      outcome.comparison = compareOutcome(row, outcome);
      output.rows.push(outcome);
    }
    assert.equal(output.rows.length, 216);
    assert.equal(output.ancillaryGaps.length, 96);
    assert.equal(output.typedAssertionGaps.length, 0);
  } finally {
    // The invocation recipe supplies this output path; keep the existing fs error if it is absent.
    writeJson(/** @type {!string} */ (process.env['GEOSPEC_VITEST_OUTPUT']), output);
  }
});
