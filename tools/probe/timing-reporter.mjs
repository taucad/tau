// Temporary probe reporter (never merged): one NDJSON line per finished test with its wall-clock start, so rows
// that stall can be lined up against what the other workers were running at the time.
import { appendFileSync } from 'node:fs';

const out = process.env.PROBE_TIMINGS;

export default class TimingReporter {
  onTestCaseResult(testCase) {
    const diagnostic = testCase.diagnostic();
    const result = testCase.result();
    appendFileSync(
      out,
      `${JSON.stringify({
        file: testCase.module.moduleId.split(/[\\/]src[\\/]/).pop(),
        name: testCase.fullName,
        state: result.state,
        start: diagnostic?.startTime,
        ms: diagnostic?.duration,
      })}\n`,
    );
  }
}
