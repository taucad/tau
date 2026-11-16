/**
 * The view commands (onboarding blueprint, Finding 6): every per-view control that changes an inheritable leaf, the
 * menu toggles, the G and P keys, the grid unit, Reset and the agent's `arrange_workbench`, writes the view record
 * through these, never through the live graphics owner.
 *
 * Rules common to every writer:
 *
 * - Setting a leaf writes the value. When it equals the format value and this device holds a personal default for
 *   the leaf (whatever the state of `viewerControls`), the leaf is added to the device's exceptions for the view first;
 *   otherwise any exception for it is removed.
 * - Resetting a leaf writes the format value and removes any exception.
 * - A command succeeds only when the exceptions it changes and the record are both saved; when either is refused or
 *   fails, the exceptions are put back as they were.
 *
 * Every write goes through the checked record store (`editViewFile`), so its conflict handling and issue states apply.
 */
import { useMemo } from 'react';
import {
  lengthUnits,
  resolveViewSettings,
  tauViewDefaults,
  viewRecordV1Defaults,
  withViewField,
} from '@taucad/workbench';
import type { LengthUnit, ViewFieldPath, ViewFieldValues, WorkbenchView } from '@taucad/workbench';
import type { ViewerViewFields } from '@taucad/viewer/cad/viewer-view-fields';
import type { PersonalViewDefaults } from '@taucad/preferences';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { useFeature } from '#flags/use-feature.js';
import { useProject } from '#hooks/use-project.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { exceptionsForView, viewExceptions, viewExceptionsStore } from '#workbench-records/view-exceptions.js';
import type { SectionWriteResult } from '#preferences/section-store.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { useViewLevels } from '#workbench-records/view-levels.js';

/** The view a command writes: its id, and the entry a new record names when the file is missing. */
// oxlint-disable-next-line typescript/no-restricted-types -- A view record names no entry with `null` (the file picker).
export type ViewFieldTarget = Readonly<{ viewId: string; entryPath: string | null }>;

/** What a view command does to the device's exceptions and the record. */
export type ViewFieldCommandPorts = Readonly<{
  projectId: string;
  /** The record store's checked edit (`useWorkbenchViewCommands().edit`). */
  edit: (viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) => Promise<boolean>;
  /** The person's own view defaults on this device, read at the moment of the command. */
  personDefaults: () => PersonalViewDefaults;
  /** The leaves this device lists for the view right now. */
  exceptionsOf: (projectId: string, viewId: string) => readonly ViewFieldPath[];
  addException: (projectId: string, viewId: string, leaf: ViewFieldPath) => SectionWriteResult;
  removeException: (projectId: string, viewId: string, leaf: ViewFieldPath) => SectionWriteResult;
}>;

/* One change to a view's exceptions: the write that makes it, and the writes that put the earlier list back. */
type ExceptionChange = Readonly<{ apply: () => SectionWriteResult; undo: () => void }>;

/**
 * The view commands. Each resolves to whether both writes it needs were saved: the device's exceptions, when the
 * command changes them, and the record. When either is refused or fails, the exceptions are put back as they were.
 */
export type ViewFieldCommands = Readonly<{
  setViewField: <Leaf extends ViewFieldPath>(
    view: ViewFieldTarget,
    leaf: Leaf,
    value: ViewFieldValues[Leaf],
  ) => Promise<boolean>;
  resetViewField: (view: ViewFieldTarget, leaf: ViewFieldPath) => Promise<boolean>;
}>;

/* Runs `run` once `previous` settles; an earlier command's failure is its own caller's to report. */
const runAfter = async (previous: Promise<unknown> | undefined, run: () => Promise<boolean>): Promise<boolean> => {
  try {
    await previous;
  } catch {
    // Reported to the earlier command's caller.
  }
  return run();
};

const hasPersonalDefault = (defaults: PersonalViewDefaults, leaf: ViewFieldPath): boolean =>
  (defaults as Readonly<Partial<Record<ViewFieldPath, unknown>>>)[leaf] !== undefined;

/**
 * The view commands over explicit ports, so tests run them against the real record store.
 *
 * @param ports - The project, the record edit, the person's defaults and the exceptions writers.
 * @returns The commands.
 */
export const createViewFieldCommands = (ports: ViewFieldCommandPorts): ViewFieldCommands => {
  const write = async (view: ViewFieldTarget, change: (record: WorkbenchView) => WorkbenchView): Promise<boolean> =>
    ports.edit(view.viewId, (current) => change(current ?? newViewRecord(view.entryPath)));

  /* A view's commands run one at a time, in order, so a later value is never overwritten by an earlier one still in
   * flight. A command still waiting when a newer one for the same leaf arrives is skipped: a field of view scrub
   * writes the value it settles on, not every step. */
  const chains = new Map<string, Promise<unknown>>();
  const tickets = new Map<string, number>();
  const queued = async (viewId: string, key: string, run: () => Promise<boolean>): Promise<boolean> => {
    const slot = `${viewId}/${key}`;
    const ticket = (tickets.get(slot) ?? 0) + 1;
    tickets.set(slot, ticket);
    const next = runAfter(chains.get(viewId), async () => (tickets.get(slot) === ticket ? run() : true));
    chains.set(viewId, next);
    try {
      return await next;
    } finally {
      if (chains.get(viewId) === next) {
        chains.delete(viewId);
      }
    }
  };

  /* The change that lists `leaf` for the view or stops listing it; none when the list already says so. */
  const listing = (viewId: string, leaf: ViewFieldPath, listed: boolean): ExceptionChange | undefined => {
    if (ports.exceptionsOf(ports.projectId, viewId).includes(leaf) === listed) {
      return undefined;
    }
    const add = (): SectionWriteResult => ports.addException(ports.projectId, viewId, leaf);
    const remove = (): SectionWriteResult => ports.removeException(ports.projectId, viewId, leaf);
    return listed ? { apply: add, undo: remove } : { apply: remove, undo: add };
  };

  /* The exceptions first, so the view never reads as inheriting while the record write is in flight; both must save,
   * or the exceptions go back to what they were. */
  const withExceptions = async (
    change: ExceptionChange | undefined,
    writeRecord: () => Promise<boolean>,
  ): Promise<boolean> => {
    if (change !== undefined && change.apply() !== 'saved') {
      change.undo();
      return false;
    }
    let saved = false;
    try {
      saved = await writeRecord();
    } finally {
      if (!saved) {
        change?.undo();
      }
    }
    return saved;
  };

  return {
    async setViewField(view, leaf, value) {
      return queued(view.viewId, leaf, async () => {
        const listed = value === viewRecordV1Defaults[leaf] && hasPersonalDefault(ports.personDefaults(), leaf);
        return withExceptions(listing(view.viewId, leaf, listed), async () =>
          write(view, (record) => withViewField(record, leaf, value)),
        );
      });
    },
    async resetViewField(view, leaf) {
      return queued(view.viewId, leaf, async () =>
        withExceptions(listing(view.viewId, leaf, false), async () =>
          write(view, (record) => withViewField(record, leaf, viewRecordV1Defaults[leaf])),
        ),
      );
    },
  };
};

/**
 * The view commands for the open project.
 *
 * @returns The commands, stable while the project and its file client are.
 */
export const useViewFieldCommands = (): ViewFieldCommands => {
  const { projectId } = useProject();
  const { edit } = useWorkbenchViewCommands();
  return useMemo(
    () =>
      createViewFieldCommands({
        projectId,
        edit,
        personDefaults: () => personRecordStores.viewer.read().viewDefaults,
        exceptionsOf: (project, viewId) => exceptionsForView(viewExceptionsStore.read(), project, viewId),
        addException: viewExceptions.add,
        removeException: viewExceptions.remove,
      }),
    [edit, projectId],
  );
};

/**
 * The view commands as the viewer bar takes them (`ViewerControls`' `viewFields`), for one view. A grid unit the
 * record cannot hold is ignored.
 *
 * With `viewerControls` on, the bar also learns where each leaf's value comes from (`sourceOf`, resolved over the view
 * record, the person's defaults and this device's exceptions) and what Reset returns a leaf to (`inheritsFrom`), and
 * each set or reset is reported with `level: 'view'`. With it off the bar shows no marks.
 *
 * @param view - The view the bar shows, or `undefined` for a bar that keeps changing the live owner (a shared session).
 * @returns The bar's commands.
 */
export const useViewerViewFieldCommands = (view: ViewFieldTarget | undefined): ViewerViewFields | undefined => {
  const commands = useViewFieldCommands();
  const { projectId, viewRecords } = useProject();
  const viewerControls = useFeature('viewerControls');
  const telemetry = useOnboardingTelemetry();
  const viewId = view?.viewId;
  const entryPath = view?.entryPath;
  const levels = useViewLevels(projectId, viewId ?? '');
  const record = viewId === undefined ? undefined : viewRecords.get(viewId);
  const sources = useMemo(() => {
    if (!viewerControls || entryPath === undefined) {
      return undefined;
    }
    return resolveViewSettings({ tau: tauViewDefaults, ...levels, view: record }).sources;
  }, [entryPath, levels, record, viewerControls]);
  return useMemo(() => {
    if (viewId === undefined || entryPath === undefined) {
      return undefined;
    }
    const target = { viewId, entryPath };
    const reportSet = (leaf: ViewFieldPath): void => {
      if (sources !== undefined) {
        telemetry.viewerDefaultChanged({ level: 'view', field: leaf });
      }
    };
    const reportReset = (leaf: ViewFieldPath): void => {
      if (sources !== undefined) {
        telemetry.viewerOverrideReset({ level: 'view', field: leaf });
      }
    };
    const fields: ViewerViewFields = {
      set: async (leaf, value) => {
        if (leaf === 'grid.unit') {
          if (!lengthUnits.includes(value as LengthUnit)) {
            return false;
          }
          reportSet(leaf);
          return commands.setViewField(target, 'grid.unit', value as LengthUnit);
        }
        reportSet(leaf);
        return commands.setViewField(target, leaf, value as ViewFieldValues[typeof leaf]);
      },
      reset: (leaf) => {
        reportReset(leaf);
        void commands.resetViewField(target, leaf);
      },
    };
    if (sources === undefined) {
      return fields;
    }
    return {
      ...fields,
      sourceOf: (leaf) => sources[leaf],
      inheritsFrom: (leaf) => (leaf !== 'upDirection' && levels.person?.[leaf] !== undefined ? 'person' : 'tau'),
    } satisfies ViewerViewFields;
  }, [commands, entryPath, levels.person, sources, telemetry, viewId]);
};
