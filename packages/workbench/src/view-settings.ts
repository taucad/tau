/**
 * Resolution of the nine inheritable view leaves: Tau, then the person, then the view (Finding 6).
 *
 * A view file holds a value for every leaf. A leaf whose value differs from its frozen version 1 format value, or that
 * the device's exceptions list for the view, is set in that view. Any other leaf inherits: the person's default when
 * one is given, otherwise Tau's value. The up axis is a model convention and never reads the person.
 */
import type { WorkbenchView } from '#records.schema.js';
import { viewFieldPaths, viewRecordV1Defaults } from '#view-fields.js';
import type { ViewFieldPath, ViewFieldValues } from '#view-fields.js';

/**
 * What Tau shows for a leaf when no level sets it: the top of the inheritance chain.
 *
 * It equals {@link viewRecordV1Defaults} at launch, so every existing view file renders as it did before inheritance.
 * Unlike the format values it may change later; changing it moves every view that inherits the leaf.
 *
 * @public
 *
 * @example <caption>Resolve a view from Tau's values alone</caption>
 * ```typescript
 * import { resolveViewSettings, tauViewDefaults, workbenchRecords } from '@taucad/workbench';
 *
 * const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
 * console.log(resolveViewSettings({ tau: tauViewDefaults, view }).values.fieldOfView); // 60
 * ```
 */
export const tauViewDefaults: Readonly<ViewFieldValues> = Object.freeze({
  ...viewRecordV1Defaults,
});

/**
 * The level a resolved leaf comes from.
 *
 * @public
 */
export type ViewFieldSource = 'tau' | 'person' | 'view';

/**
 * The parts of a view record that hold the inheritable leaves.
 *
 * @public
 */
export type ViewFieldsRecord = Pick<WorkbenchView, 'fieldOfView' | 'upDirection' | 'display' | 'grid'>;

/**
 * The person's defaults for the inheritable leaves. The up axis has no personal level.
 *
 * @public
 */
export type PersonViewFieldDefaults = Partial<Omit<ViewFieldValues, 'upDirection'>>;

/**
 * The input to {@link resolveViewSettings}. An object, so later levels (a project's defaults, shared pins) are added
 * without a breaking change.
 *
 * @public
 */
export type ResolveViewSettingsInput = Readonly<{
  /** The top of the chain, normally {@link tauViewDefaults}. */
  tau: Readonly<ViewFieldValues>;
  /** The person's own defaults. Absent on a host with no person (a headless render, an agent host). */
  person?: Readonly<PersonViewFieldDefaults>;
  /** The leaves this device's person set in this view to the format value. */
  exceptions?: readonly ViewFieldPath[];
  /** The view record, parsed. Absent: the view holds the format value for every leaf. */
  view: ViewFieldsRecord | undefined;
}>;

/**
 * Each leaf's resolved value and the level it comes from.
 *
 * @public
 */
export type ResolvedViewSettings = Readonly<{
  values: Readonly<ViewFieldValues>;
  sources: Readonly<Record<ViewFieldPath, ViewFieldSource>>;
}>;

/**
 * Read one leaf from a view record.
 *
 * @param view - The parsed view record.
 * @param leaf - The leaf path.
 * @returns The value the record holds for the leaf.
 *
 * @public
 *
 * @example <caption>Read the grid unit</caption>
 * ```typescript
 * import { readViewField, workbenchRecords } from '@taucad/workbench';
 *
 * const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts', grid: { unit: 'in' } });
 * console.log(readViewField(view, 'grid.unit')); // 'in'
 * ```
 */
export const readViewField = <Leaf extends ViewFieldPath>(view: ViewFieldsRecord, leaf: Leaf): ViewFieldValues[Leaf] =>
  viewFieldValuesOf(view)[leaf];

/**
 * Every inheritable leaf a view record holds, keyed by leaf path.
 *
 * @param view - The parsed view record.
 * @returns The record's nine leaf values.
 *
 * @public
 *
 * @example <caption>List what a view holds</caption>
 * ```typescript
 * import { viewFieldValuesOf, workbenchRecords } from '@taucad/workbench';
 *
 * const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
 * console.log(viewFieldValuesOf(view)['display.grid']); // true
 * ```
 */
export const viewFieldValuesOf = (view: ViewFieldsRecord): ViewFieldValues => ({
  upDirection: view.upDirection,
  fieldOfView: view.fieldOfView,
  'display.surfaces': view.display.surfaces,
  'display.lines': view.display.lines,
  'display.gizmo': view.display.gizmo,
  'display.grid': view.display.grid,
  'display.axes': view.display.axes,
  'display.matcap': view.display.matcap,
  'grid.unit': view.grid.unit,
});

/**
 * A copy of a view record with one leaf written. Every other field is kept as the record holds it.
 *
 * @param view - The parsed view record.
 * @param leaf - The leaf path.
 * @param value - The value to write.
 * @returns The record with the leaf written.
 *
 * @public
 *
 * @example <caption>Turn the grid off in one view</caption>
 * ```typescript
 * import { withViewField, workbenchRecords } from '@taucad/workbench';
 *
 * const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
 * console.log(withViewField(view, 'display.grid', false).display.grid); // false
 * ```
 */
export const withViewField = <View extends ViewFieldsRecord, Leaf extends ViewFieldPath>(
  view: View,
  leaf: Leaf,
  value: ViewFieldValues[Leaf],
): View => {
  if (leaf === 'upDirection') {
    return { ...view, upDirection: value as ViewFieldValues['upDirection'] };
  }
  if (leaf === 'fieldOfView') {
    return { ...view, fieldOfView: value as number };
  }
  if (leaf === 'grid.unit') {
    return {
      ...view,
      grid: { ...view.grid, unit: value as ViewFieldValues['grid.unit'] },
    };
  }
  const key = leaf.slice('display.'.length) as keyof ViewFieldsRecord['display'];
  return { ...view, display: { ...view.display, [key]: value as boolean } };
};

/**
 * Resolve each inheritable leaf of a view: the view's value when the view sets the leaf, otherwise the person's
 * default, otherwise Tau's value. A leaf is set in the view when its value differs from the version 1 format value
 * ({@link viewRecordV1Defaults}), or when `exceptions` lists it. The up axis never reads the person.
 *
 * @param input - Tau's values, the optional person and exceptions, and the parsed view record.
 * @returns Each leaf's value and source.
 *
 * @public
 *
 * @example <caption>A personal default applies where the view does not set the leaf</caption>
 * ```typescript
 * import { resolveViewSettings, tauViewDefaults, workbenchRecords } from '@taucad/workbench';
 *
 * const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
 * const resolved = resolveViewSettings({ tau: tauViewDefaults, person: { 'display.grid': false }, view });
 * console.log(resolved.values['display.grid'], resolved.sources['display.grid']); // false 'person'
 * ```
 */
export const resolveViewSettings = (input: ResolveViewSettingsInput): ResolvedViewSettings => {
  const held: Readonly<ViewFieldValues> = input.view ? viewFieldValuesOf(input.view) : viewRecordV1Defaults;
  const exceptions = new Set(input.exceptions ?? []);
  const resolved = viewFieldPaths.map((leaf): [ViewFieldPath, unknown, ViewFieldSource] => {
    const value = held[leaf];
    if (value !== viewRecordV1Defaults[leaf] || exceptions.has(leaf)) {
      return [leaf, value, 'view'];
    }
    const person = leaf === 'upDirection' ? undefined : input.person?.[leaf];
    return person === undefined ? [leaf, input.tau[leaf], 'tau'] : [leaf, person, 'person'];
  });
  return {
    values: Object.fromEntries(resolved.map(([leaf, value]) => [leaf, value])) as ViewFieldValues,
    sources: Object.fromEntries(resolved.map(([leaf, , source]) => [leaf, source])) as Record<
      ViewFieldPath,
      ViewFieldSource
    >,
  };
};
