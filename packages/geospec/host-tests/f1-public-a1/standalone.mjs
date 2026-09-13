import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '@taucad/geospec/assertion-client';
import { Engine, canonicalize } from '@taucad/geospec-engine-native/node';

import {
  admitSubject,
  assertOutput,
  compareReport,
  createForwardingRecorder,
  errorRecord,
  loadAuthority,
  reportRecord,
  rowContract,
  writeOutput,
} from './authority.mjs';

const authority = loadAuthority();
const output = { schemaVersion: 1, route: 'javascript-standalone', rows: [] };

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
