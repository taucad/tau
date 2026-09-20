import { isDeepStrictEqual } from 'node:util';
import { sha256 } from '#bench/lib';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** Require the installed profile's complete public record, preserving legitimate failed verdicts.
 * @internal
 * @param reports - Complete vector.
 * @param backend - Explicit frozen product backend; only legacy has no canonical records.
 * @returns Whether every required field and exact canonical byte receipt is present.
 */
export const completeReports = (reports: unknown, backend: string): reports is Array<Record<string, unknown>> => {
  if (!['legacy', 'native', 'mixed'].includes(backend) || !Array.isArray(reports) || reports.length === 0) {
    return false;
  }
  return reports.every((report: unknown) => {
    if (!record(report)) {
      return false;
    }
    if (backend === 'legacy') {
      return typeof report['status'] === 'string';
    }
    if (
      typeof report['claimId'] !== 'string' ||
      typeof report['status'] !== 'string' ||
      !record(report['result']) ||
      typeof report['resultStatus'] !== 'string' ||
      typeof report['result']['status'] !== 'string' ||
      report['resultStatus'] !== report['result']['status']
    ) {
      return false;
    }
    return ['canonicalClaim', 'canonicalPlan', 'canonicalResult'].every((key) => {
      const bytes = report[key];
      return (
        record(bytes) &&
        typeof bytes['utf8'] === 'string' &&
        Buffer.byteLength(bytes['utf8']) === bytes['byteLength'] &&
        sha256(bytes['utf8']) === bytes['sha256']
      );
    });
  });
};
/** Qualify the actual timed first event against the complete expected first claim after timing.
 * @internal
 * @param first - Retained first event envelope.
 * @param reports - Independently expected full vector, or the qualified actual suite.
 * @param backend - Frozen route backend.
 * @returns Exact first-claim equality under the actual public profile.
 */
export const firstReportMatches = (first: unknown, reports: unknown, backend: string): boolean => {
  if (
    !record(first) ||
    first['cleanupStarted'] !== false ||
    !completeReports(reports, backend) ||
    !record(first['report'])
  ) {
    return false;
  }
  return isDeepStrictEqual(backend === 'legacy' ? first['report']['result'] : first['report'], reports[0]);
};
