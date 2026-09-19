import { createGeoSpecAssertionClient } from '@taucad/geospec/assertion-client';
import { createGeoSpecVitestAdapter } from '@taucad/geospec/vitest';
import { Engine, canonicalize } from '@taucad/geospec-engine-native/node';
import { expect, it } from 'vitest';

/* oxlint-disable no-restricted-imports -- Installed external-consumer acceptance imports its copied sibling harness directly. */
import {
  admitSubject,
  assertOutput,
  compareReport,
  createForwardingRecorder,
  createOutput,
  errorRecord,
  loadAuthority,
  reportFromRecorder,
  rowContract,
  writeOutput,
} from './authority.mjs';
/* oxlint-enable no-restricted-imports */

it('should run all 12 approved rows through the installed Vitest matcher', async () => {
  const authority = loadAuthority();
  const output = createOutput('javascript-vitest');

  for (const row of authority.rows) {
    const claim = rowContract(row);
    const nativeEngine = new Engine();
    const admission = admitSubject(nativeEngine, authority.admissions.get(row.geometryId));
    const recorder = createForwardingRecorder(nativeEngine);
    const client = createGeoSpecAssertionClient({
      canonicalize,
      claimId: () => claim.claimId,
      engine: recorder.engine,
      subjectSlot: claim.subjectSlots[0],
      workUnitLimit: claim.workUnitBudget,
    });
    const adapter = createGeoSpecVitestAdapter(client);
    expect.extend(adapter.matchers);
    const chain = claim.polarity === 'negative' ? expect(admission.subject).not : expect(admission.subject);
    let invocationError = null;
    let flushError = null;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each row owns a complete engine and matcher lifecycle before the next row starts.
      await chain.toSatisfyRationalPlate();
    } catch (error) {
      invocationError = errorRecord(
        error,
        error instanceof Error && (error.name === 'AssertionError' || error.constructor.name === 'JestExtendError'),
      );
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- Flush must settle this row's matcher before the next engine lifecycle starts.
      await adapter.flush();
    } catch (error) {
      flushError = errorRecord(error);
    }
    const report = reportFromRecorder(recorder.calls, canonicalize);
    output.rows.push({
      id: row.id,
      admission,
      error: invocationError ?? flushError,
      flushError,
      invocationError,
      report,
      recorderCalls: recorder.calls,
      comparison: compareReport(row, report, canonicalize),
    });
  }

  writeOutput(output);
  assertOutput(output);
});
