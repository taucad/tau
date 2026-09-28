import assert from 'node:assert/strict';
import type { ProductWorkload } from '#bench/lib';

/** A fixed independent admission in an ordered aggregate workload. @internal */
export type MeasurementMember = { id: string; workload: string };
/** Public report boundary and retained cleanup ACK. @internal */
export type SettledMember<T> = {
  reports: Array<Record<string, unknown>>;
  acknowledge: () => void;
  completed: Promise<T>;
};

/** Resolve an explicit fixed selection; nested aggregates are not independent admissions.
 * @internal
 * @param workloads - Frozen workload inventory.
 * @param id - Selected workload.
 * @returns Ordered independent members, or a single leaf admission.
 */
export const measurementMembers = (workloads: ProductWorkload[], id: string): MeasurementMember[] => {
  const workload = workloads.find((value) => value.id === id);
  assert.ok(workload, `Unknown workload: ${id}`);
  if (workload.kind !== 'independent-subject-batch' && workload.kind !== 'selected-suite') {
    return [{ id, workload: id }];
  }
  assert.ok(workload.members.length > 1, 'Aggregate requires at least two independent admissions.');
  assert.equal(
    new Set(workload.members.map((member) => member.id)).size,
    workload.members.length,
    'Instance IDs must be unique.',
  );
  const leaves = workloads.filter(
    (value) => value.kind !== 'independent-subject-batch' && value.kind !== 'selected-suite',
  );
  for (const member of workload.members) {
    assert.ok(
      leaves.some((leaf) => leaf.id === member.workload),
      `Unknown/nested member: ${member.workload}`,
    );
  }
  if (workload.kind === 'selected-suite') {
    assert.deepEqual(
      workload.members.map((member) => member.workload).toSorted(),
      leaves.map((leaf) => leaf.id).toSorted(),
      'Suite must cover the entire fixed leaf inventory exactly once.',
    );
  }
  return workload.members;
};

/** Execute independent admissions serially, holding cleanup until the final public report.
 * @internal
 * @returns Raw aggregate measurements; qualification runs after the boundary.
 */
export const measureMembers = async <T>({
  members,
  launch,
  now = () => Number(process.hrtime.bigint()),
  startTime,
}: {
  members: MeasurementMember[];
  launch: (member: MeasurementMember, index: number) => Promise<SettledMember<T>>;
  now?: () => number;
  startTime?: number;
}): Promise<{
  suiteReportNs: number;
  completedSubjects: number;
  completedClaims: number;
  throughputPerSecond: number;
  throughputUnit: string;
  reports: Array<Record<string, unknown>>;
  members: T[];
}> => {
  assert.ok(members.length > 0);
  const retained: Array<SettledMember<T>> = [];
  const started = startTime ?? now();
  let boundary = started;
  try {
    for (const [index, member] of members.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Serial independent admissions retain each subject until final suite publication.
      retained.push(await launch(member, index));
      boundary = now();
    }
    const suiteReportNs = boundary - started;
    assert.ok(suiteReportNs > 0);
    const completedSubjects = retained.length;
    const completedClaims = retained.reduce((sum, member) => sum + member.reports.length, 0);
    for (const member of retained) {
      member.acknowledge();
    }
    const completed = await Promise.all(retained.map(async (member) => member.completed));
    return {
      suiteReportNs,
      completedSubjects,
      completedClaims,
      throughputPerSecond: (completedSubjects * 1_000_000_000) / suiteReportNs,
      throughputUnit: 'completed-independent-subjects-per-second',
      reports: retained.flatMap((member) => member.reports),
      members: completed,
    };
  } catch (error) {
    for (const member of retained) {
      member.acknowledge();
    }
    const completedMembers = await Promise.allSettled(retained.map(async (member) => member.completed));
    throw new Error('Aggregate did not complete its fixed member selection.', {
      cause: {
        failure: error instanceof Error ? { message: error.message, cause: error.cause } : String(error),
        completedMembers,
      },
    });
  } finally {
    for (const member of retained) {
      member.acknowledge();
    }
    await Promise.allSettled(retained.map(async (member) => member.completed));
  }
};
