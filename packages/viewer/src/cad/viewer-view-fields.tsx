/**
 * The view commands a host may give the viewer bar (onboarding blueprint, Finding 6). With them, every per-view control
 * that changes an inheritable leaf (the settings menu's toggles, up direction and field of view, the G and P keys and
 * the grid unit) calls the host's command instead of changing the live graphics owner; the host writes the view
 * record, and the record reaches the live owner through the host's resolver. Without them, the controls change the
 * live owner as before, so an embedder that supplies none keeps today's behaviour.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The inheritable leaves of a view, keyed by leaf path. Mirrors `ViewFieldValues` in `@taucad/workbench`, which this
 * package does not depend on; `grid.unit` is a length unit symbol.
 *
 * @public
 */
export type ViewerViewFieldValues = {
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
  'grid.unit': string;
};

/**
 * The leaf path of one inheritable view field.
 *
 * @public
 */
export type ViewerViewFieldPath = keyof ViewerViewFieldValues;

/**
 * The level a leaf's shown value comes from.
 *
 * @public
 */
export type ViewerViewFieldSource = 'tau' | 'person' | 'view';

/**
 * The host's view commands for one view.
 *
 * @public
 */
export type ViewerViewFields = Readonly<{
  /** Set a leaf in this view. */
  set: <Leaf extends ViewerViewFieldPath>(leaf: Leaf, value: ViewerViewFieldValues[Leaf]) => void;
  /** Reset a leaf in this view, so it inherits again. */
  reset: (leaf: ViewerViewFieldPath) => void;
  /** Where a leaf's shown value comes from, for the menu's markers. */
  sourceOf?: (leaf: ViewerViewFieldPath) => ViewerViewFieldSource;
}>;

const viewerViewFieldsContext = createContext<ViewerViewFields | undefined>(undefined);

/**
 * Provides the host's view commands to the bar's controls. `ViewerControls` provides its `viewFields`.
 *
 * @param props - The commands, or `undefined` to keep the controls on the live graphics owner, and the controls.
 * @returns The provider.
 *
 * @public
 */
export function ViewerViewFieldsProvider({
  value,
  children,
}: Readonly<{ value: ViewerViewFields | undefined; children?: ReactNode }>): React.JSX.Element {
  return <viewerViewFieldsContext.Provider value={value}>{children}</viewerViewFieldsContext.Provider>;
}

/**
 * The host's view commands, when the bar was given them.
 *
 * @returns The commands, or `undefined` when the controls change the live graphics owner.
 *
 * @public
 */
export const useViewerViewFields = (): ViewerViewFields | undefined => useContext(viewerViewFieldsContext);
