import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '@taucad/geospec/assertion-client';
import { Engine, canonicalize } from '@taucad/geospec-engine-native/node';

/* oxlint-disable no-restricted-imports -- Installed external-consumer acceptance imports its copied sibling harness directly. */
import {
  admitSubject,
  assertOutput,
  compareReport,
  createForwardingRecorder,
  createOutput,
  errorRecord,
  loadAuthority,
  reportRecord,
  rowContract,
  writeOutput,
} from './authority.mjs';
/* oxlint-enable no-restricted-imports */

const authority = loadAuthority();
const output = createOutput('javascript-standalone');

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
  const chain =
    claim.polarity === 'negative' ? client.expectGeo(admission.subject).not : client.expectGeo(admission.subject);
  let report = null;
  let failure = null;
  try {
    // oxlint-disable-next-line no-await-in-loop -- Each row owns a complete engine and assertion lifecycle before the next row starts.
    report = reportRecord(await chain.toSatisfyRationalPlate(), canonicalize);
  } catch (error) {
    failure = errorRecord(error, error instanceof GeoSpecAssertionError);
    if (error instanceof GeoSpecAssertionError) {
      report = reportRecord(error.report, canonicalize);
    }
  }
  output.rows.push({
    id: row.id,
    admission,
    error: failure,
    report,
    recorderCalls: recorder.calls,
    comparison: compareReport(row, report, canonicalize),
  });
}

writeOutput(output);
assertOutput(output);
