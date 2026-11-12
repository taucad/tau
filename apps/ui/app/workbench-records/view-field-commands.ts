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
 *
 * Every write goes through the checked record store (`editViewFile`), so its conflict handling and issue states apply.
 */
import { useMemo } from 'react';
import { viewFieldPaths, viewRecordV1Defaults, withViewField } from '@taucad/workbench';
import type { ViewFieldPath, ViewFieldValues, WorkbenchView } from '@taucad/workbench';
import type { PersonalViewDefaults } from '@taucad/preferences';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { useProject } from '#hooks/use-project.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

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
  addException: (projectId: string, viewId: string, leaf: ViewFieldPath) => void;
  removeException: (projectId: string, viewId: string, leaf: ViewFieldPath) => void;
  clearExceptions: (projectId: string, viewId: string) => void;
}>;

/** The view commands. Each resolves to whether the record store accepted the write. */
export type ViewFieldCommands = Readonly<{
  setViewField: <Leaf extends ViewFieldPath>(
    view: ViewFieldTarget,
    leaf: Leaf,
    value: ViewFieldValues[Leaf],
  ) => Promise<boolean>;
  resetViewField: (view: ViewFieldTarget, leaf: ViewFieldPath) => Promise<boolean>;
  /** "Reset view": every leaf back to its format value, and the view's exceptions cleared. */
  resetView: (view: ViewFieldTarget) => Promise<boolean>;
}>;

const hasPersonalDefault = (defaults: PersonalViewDefaults, leaf: ViewFieldPath): boolean =>
  leaf !== 'upDirection' && defaults[leaf] !== undefined;

/**
 * The view commands over explicit ports, so tests run them against the real record store.
 *
 * @param ports - The project, the record edit, the person's defaults and the exceptions writers.
 * @returns The commands.
 */
export const createViewFieldCommands = (ports: ViewFieldCommandPorts): ViewFieldCommands => {
  const write = async (view: ViewFieldTarget, change: (record: WorkbenchView) => WorkbenchView): Promise<boolean> =>
    ports.edit(view.viewId, (current) => change(current ?? newViewRecord(view.entryPath)));

  return {
    async setViewField(view, leaf, value) {
      if (value === viewRecordV1Defaults[leaf] && hasPersonalDefault(ports.personDefaults(), leaf)) {
        // Added before the value, so the view never reads as inheriting while the write is in flight.
        ports.addException(ports.projectId, view.viewId, leaf);
      } else {
        ports.removeException(ports.projectId, view.viewId, leaf);
      }
      return write(view, (record) => withViewField(record, leaf, value));
    },
    async resetViewField(view, leaf) {
      ports.removeException(ports.projectId, view.viewId, leaf);
      return write(view, (record) => withViewField(record, leaf, viewRecordV1Defaults[leaf]));
    },
    async resetView(view) {
      ports.clearExceptions(ports.projectId, view.viewId);
      return write(view, (record) => {
        let next = record;
        for (const leaf of viewFieldPaths) {
          next = withViewField(next, leaf, viewRecordV1Defaults[leaf]);
        }
        return next;
      });
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
        addException: viewExceptions.add,
        removeException: viewExceptions.remove,
        clearExceptions: viewExceptions.clearView,
      }),
    [edit, projectId],
  );
};
