/**
 * The device's record of what the agent's `arrange_workbench` set in a view. The tool runs in the agent host worker,
 * which has no local storage, so the worker tells the page which leaves a written view names and the page applies the
 * view menu's rule here: a leaf set to the format value while this device holds a personal default for it is kept as
 * an exception for the view, whatever the state of `viewerControls`; any other value clears one. The record is already
 * written, so only the exceptions change, and a refused exception write leaves the value alone: the leaves whose
 * exception this device could not store are returned, and the agent path warns about them.
 */
import { viewFieldPaths, viewRecordV1Defaults } from '@taucad/workbench';
import type { ViewFieldPath, ViewFieldValues } from '@taucad/workbench';
import type { PersonalViewDefaults } from '@taucad/preferences';
import type { SectionWriteResult } from '#preferences/section-store.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

const hasPersonalDefault = (defaults: PersonalViewDefaults, leaf: ViewFieldPath): boolean =>
  leaf !== 'upDirection' && defaults[leaf] !== undefined;

/** The ports the exception rule reads and writes. */
export type ViewFieldExceptionPorts = Readonly<{
  projectId: string;
  /** The person's own view defaults on this device, read at the moment of the write. */
  personDefaults: () => PersonalViewDefaults;
  addException: (projectId: string, viewId: string, leaf: ViewFieldPath) => SectionWriteResult;
  removeException: (projectId: string, viewId: string, leaf: ViewFieldPath) => SectionWriteResult;
}>;

/**
 * The exception rule for one leaf set in one view: a value equal to the format value over a personal default is kept
 * as an exception; any other value clears one.
 *
 * @param ports - The project, the person's defaults and the exceptions writers.
 * @param viewId - The view.
 * @param field - The leaf set and the value written.
 * @returns The exceptions store's answer: `refused` or `newer` when this device could not store the exception.
 */
export const recordViewFieldException = <Leaf extends ViewFieldPath>(
  ports: ViewFieldExceptionPorts,
  viewId: string,
  [leaf, value]: readonly [Leaf, ViewFieldValues[Leaf]],
): SectionWriteResult =>
  value === viewRecordV1Defaults[leaf] && hasPersonalDefault(ports.personDefaults(), leaf)
    ? ports.addException(ports.projectId, viewId, leaf)
    : ports.removeException(ports.projectId, viewId, leaf);

/**
 * What `arrange_workbench` set in a view, recorded as the view menu records it (BD7): the agent's write is already on
 * disk, so only the exceptions change.
 *
 * @param ports - The project, the person's defaults and the exceptions writers.
 * @param viewId - The view the call wrote.
 * @param fields - The leaves it named, with the values written.
 * @returns The leaves whose exception this device could not store, empty when every write was saved.
 */
export const markViewFieldsSet = (
  ports: ViewFieldExceptionPorts,
  viewId: string,
  fields: Readonly<Partial<ViewFieldValues>>,
): ViewFieldPath[] => {
  const unsaved: ViewFieldPath[] = [];
  for (const leaf of viewFieldPaths) {
    const value = fields[leaf];
    if (value !== undefined && recordViewFieldException(ports, viewId, [leaf, value]) !== 'saved') {
      unsaved.push(leaf);
    }
  }
  return unsaved;
};

/**
 * Record on this device what `arrange_workbench` set in one view of a project.
 *
 * @param set - The project, the view and the leaves the call wrote.
 * @returns The leaves whose exception this device could not store; each is warned about, as the worker gets no reply.
 */
export const markDeviceViewFieldsSet = (
  set: Readonly<{ projectId: string; viewId: string; fields: Readonly<Partial<ViewFieldValues>> }>,
): ViewFieldPath[] => {
  const unsaved = markViewFieldsSet(
    {
      projectId: set.projectId,
      personDefaults: () => personRecordStores.viewer.read().viewDefaults,
      addException: viewExceptions.add,
      removeException: viewExceptions.remove,
    },
    set.viewId,
    set.fields,
  );
  if (unsaved.length > 0) {
    console.warn('[view-fields-set] The device could not store the view exceptions for these leaves', {
      projectId: set.projectId,
      viewId: set.viewId,
      leaves: unsaved,
    });
  }
  return unsaved;
};
