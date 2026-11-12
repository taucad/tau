/**
 * The layout record's policy for `recordSync` (graphics event-driven state charter D6): its codec and the field-level
 * patch algebra that lets a person's arrangement land on bytes another window, an agent or sync wrote meanwhile.
 *
 * A patch carries whole trees (`viewer`, `workbench`) and single lane flags, so two windows that change different
 * trees or different lanes both keep their change.
 */
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchLayout } from '@taucad/workbench';
import type { RecordPolicy } from '#workbench-records/record-sync-policy.js';

/** The fields of a layout one person changed: whole trees and single lane flags. */
export type WorkbenchLayoutPatch = Partial<Pick<WorkbenchLayout, 'viewer' | 'workbench'>> &
  Readonly<{ lanes?: Partial<WorkbenchLayout['lanes']> }>;

const lanes = ['chat', 'workbench'] as const;

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** The layout record's codec and patch algebra. */
export const layoutPolicy: RecordPolicy<WorkbenchLayout, WorkbenchLayoutPatch> = {
  read(bytes) {
    const result = workbenchRecords.layout.read(bytes);
    return result.status === 'current'
      ? { status: 'current', record: result.record }
      : {
          status: result.code === 'NEWER_RECORD' ? 'newer' : 'invalid',
          code: result.code,
          message: result.message,
        };
  },
  serialize: (record) => workbenchRecords.layout.serialize(record),
  diff(base, next) {
    const changedLanes = lanes.filter((lane) => base?.lanes[lane] !== next.lanes[lane]);
    return {
      ...(same(base?.viewer, next.viewer) ? {} : { viewer: next.viewer }),
      ...(same(base?.workbench, next.workbench) ? {} : { workbench: next.workbench }),
      ...(changedLanes.length > 0
        ? { lanes: Object.fromEntries(changedLanes.map((lane) => [lane, next.lanes[lane]])) }
        : {}),
    };
  },
  combine: (earlier, later) => ({
    ...earlier,
    ...later,
    ...((earlier?.lanes ?? later.lanes) ? { lanes: { ...earlier?.lanes, ...later.lanes } } : {}),
  }),
  // `next` supplies what a missing `current` lacks: the file's first write, or one after it was deleted.
  merge: (current, next, patch) => ({
    ...next,
    ...current,
    ...patch,
    lanes: { ...next.lanes, ...current?.lanes, ...patch.lanes },
    version: 1,
  }),
  isEmpty: (patch) =>
    patch.viewer === undefined && patch.workbench === undefined && Object.keys(patch.lanes ?? {}).length === 0,
  // A deleted layout is not an arrangement to adopt; a person's next change carries only what it changes, so a file
  // another window recreates meanwhile keeps that window's trees.
  keepsBaseOnAbsence: true,
};
