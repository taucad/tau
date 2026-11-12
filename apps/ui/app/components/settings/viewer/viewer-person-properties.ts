/**
 * The person properties Settings → Viewer keeps current in analytics (onboarding blueprint, Finding 12, M2): the mouse
 * preset, the gizmo style and the input device, each set with `$set` when it changes, to the value now in effect. They
 * go through `useAnalytics().capture`, so web consent and the desktop opt-out apply. Setup (WP6) sets the same names.
 */
import type { GizmoStyleId, MousePresetId } from '@taucad/preferences';
import type { Analytics } from '#hooks/use-analytics.js';

/** The viewer's person properties. */
export type ViewerPersonProperties = Partial<
  Readonly<{
    mousePreset: MousePresetId;
    gizmoStyle: GizmoStyleId;
    inputDevice: 'mouse' | 'trackpad';
  }>
>;

/** Each property's name in analytics. */
export const viewerPersonPropertyNames = {
  mousePreset: 'mouse_preset',
  gizmoStyle: 'gizmo_style',
  inputDevice: 'input_device',
} as const satisfies Record<keyof ViewerPersonProperties, string>;

/**
 * Set the given person properties on the current analytics person. Nothing is sent while analytics are not admitted.
 *
 * @param analytics - The host's analytics.
 * @param properties - The properties that changed, with their values now in effect.
 */
export const setViewerPersonProperties = (analytics: Analytics, properties: ViewerPersonProperties): void => {
  const named = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      viewerPersonPropertyNames[key as keyof ViewerPersonProperties],
      value,
    ]),
  );
  analytics.capture('$set', { $set: named });
};
