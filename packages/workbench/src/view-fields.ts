/**
 * The ten inheritable view fields, keyed by leaf path, and their frozen version 1 format values.
 *
 * `display` and `grid` are nested objects in a view record, so a level above the view (the person's defaults, later a
 * project) holds a sparse map keyed by leaf path rather than a partial record: setting the grid must not also "set" the
 * other display flags.
 */

/**
 * The grid's display units (`setGridUnit`, `constants/length-units.ts`).
 *
 * @public
 */
export const lengthUnits = ['mm', 'cm', 'm', 'in', 'ft', 'yd'] as const;

/**
 * One of {@link lengthUnits}.
 *
 * @public
 */
export type LengthUnit = (typeof lengthUnits)[number];

/**
 * The inheritable fields of a view, one entry per leaf of the view record.
 *
 * @example <caption>A sparse personal default keyed by leaf path</caption>
 * ```typescript
 * import type { ViewFieldValues } from '@taucad/workbench';
 *
 * const defaults: Partial<ViewFieldValues> = { 'display.grid': false, 'grid.unit': 'in' };
 * ```
 *
 * @public
 */
export type ViewFieldValues = {
  upDirection: 'x' | 'y' | 'z';
  /** Vertical field of view in degrees; 0 is orthographic. */
  fieldOfView: number;
  'display.surfaces': boolean;
  'display.lines': boolean;
  'display.gizmo': boolean;
  'display.grid': boolean;
  'display.axes': boolean;
  'display.matcap': boolean;
  'display.postProcessing': boolean;
  'grid.unit': LengthUnit;
};

/**
 * The leaf path of one inheritable view field.
 *
 * @public
 */
export type ViewFieldPath = keyof ViewFieldValues;

/**
 * The version 1 view record's schema default for each inheritable leaf: Z up, 60 degrees, surfaces, lines, gizmo, grid
 * and axes on, matcap and post-processing off, millimetres.
 *
 * These values are part of the version 1 file format: a leaf a view file holds at its format value reads as "not set
 * in this view". They never change without a new record version. What Tau shows when no level sets a leaf is a
 * separate table that may change later.
 *
 * @example <caption>Read a format value</caption>
 * ```typescript
 * import { viewRecordV1Defaults } from '@taucad/workbench';
 *
 * console.log(viewRecordV1Defaults.fieldOfView); // 60
 * ```
 *
 * @public
 */
export const viewRecordV1Defaults: Readonly<ViewFieldValues> = Object.freeze({
  upDirection: 'z',
  fieldOfView: 60,
  'display.surfaces': true,
  'display.lines': true,
  'display.gizmo': true,
  'display.grid': true,
  'display.axes': true,
  'display.matcap': false,
  'display.postProcessing': false,
  'grid.unit': 'mm',
});

/**
 * Every inheritable leaf path, in the order the view record declares them.
 *
 * @example <caption>Visit every inheritable leaf</caption>
 * ```typescript
 * import { viewFieldPaths } from '@taucad/workbench';
 *
 * console.log(viewFieldPaths.length); // 10
 * ```
 *
 * @public
 */
export const viewFieldPaths: readonly ViewFieldPath[] = Object.freeze(
  Object.keys(viewRecordV1Defaults) as ViewFieldPath[],
);
