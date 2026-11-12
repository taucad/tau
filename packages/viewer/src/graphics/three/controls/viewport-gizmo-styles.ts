/**
 * The view cube's styles (blueprint G1 to G4). Hiding the gizmo is the view's `display.gizmo` switch, not a style.
 */

/**
 * The gizmo styles: Tau's rounded cube, the library's sharp cube, one ball per axis direction, and a triad that takes
 * no click.
 *
 * @public
 */
export const gizmoStyleIds = ['cube', 'classic-cube', 'axis-balls', 'axes'] as const;

/**
 * One of {@link gizmoStyleIds}.
 *
 * @public
 */
export type GizmoStyleId = (typeof gizmoStyleIds)[number];
