import { useMemo } from 'react';
import type { RefObject } from 'react';
import { useCameraRig, useGraphics } from '#hooks/use-graphics.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';

/** Focus inside one of these belongs to a menu, list, tree, grid or dialog, which keeps its own keys. */
const ownKeysSelector =
  '[role=menu],[role=menubar],[role=listbox],[role=tree],[role=treegrid],[role=grid],[role=dialog],[data-radix-popper-content-wrapper]';

const fitViewKey: KeyCombination = { key: 'f' };
const sectionKey: KeyCombination = { key: 's' };
const measureKey: KeyCombination = { key: 'm' };
const gridKey: KeyCombination = { key: 'g' };
const projectionKey: KeyCombination = { key: 'p' };
const escapeKey: KeyCombination = { key: 'Escape' };
const deleteKey: KeyCombination = { key: 'Delete' };
const backspaceKey: KeyCombination = { key: 'Backspace' };

/**
 * Whether a key belongs to the viewer holding `element`: the viewer under the pointer, else the one holding focus,
 * and never while focus is in a menu, list, tree, grid or dialog. Read when the key goes down, so neither the pointer
 * nor focus is tracked. Without a `[data-viewer-frame]` ancestor, `element` stands in for its viewer.
 */
export const isViewerKeyTarget = (element: Element | undefined): boolean => {
  const frame = element?.closest('[data-viewer-frame]') ?? element;
  const focused = document.activeElement;
  if (!frame || focused?.closest(ownKeysSelector)) {
    return false;
  }
  const hovered = document.querySelector('[data-viewer-frame]:hover');
  return hovered ? hovered === frame : frame.contains(focused);
};

/** The formatted keys of the shortcuts that tooltips show. */
export type ViewerShortcutKeys = Readonly<{ fitView: string; section: string; measure: string }>;

/**
 * The viewer's shortcuts: F fits the view, S and M toggle Section and Measure, G the grid, and P switches between
 * orthographic and the last perspective field of view. Escape cancels a half-placed measurement, then stops Measure,
 * then stops Section; Delete and Backspace remove the selected cut. S, M and P are off for 2D geometry.
 *
 * Keys typed into a field never reach these bindings, and every viewer registers its own set, gated by
 * {@link isViewerKeyTarget} on `barRef`. The bindings keep the default priority, below a drag's Escape.
 */
export const useViewerShortcuts = (
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  barRef: RefObject<HTMLElement | null>,
): ViewerShortcutKeys => {
  const graphicsRef = useGraphics();
  const cameraRig = useCameraRig();

  const options = useMemo(() => {
    const isTarget = (): boolean => isViewerKeyTarget(barRef.current ?? undefined);
    const context = () => graphicsRef.getSnapshot().context;
    return {
      always: { ignoreInputs: true, enabled: isTarget },
      in3d: { ignoreInputs: true, enabled: () => isTarget() && context().geometry?.format !== 'svg' },
      escape: {
        ignoreInputs: true,
        enabled: () => isTarget() && (context().isMeasureActive || context().isSectionViewActive),
      },
      remove: {
        ignoreInputs: true,
        enabled: () => isTarget() && context().isSectionViewActive && context().selectedSectionCutId !== undefined,
      },
    };
  }, [barRef, graphicsRef]);

  const { formattedKeyCombination: fitView } = useKeybinding(
    fitViewKey,
    () => {
      graphicsRef.send({ type: 'fitView' });
    },
    options.always,
  );
  const { formattedKeyCombination: section } = useKeybinding(
    sectionKey,
    () => {
      graphicsRef.send({
        type: 'setSectionViewActive',
        payload: !graphicsRef.getSnapshot().context.isSectionViewActive,
        viewDirection: cameraRig.actorRef.getSnapshot().context.view.direction,
      });
    },
    options.in3d,
  );
  const { formattedKeyCombination: measure } = useKeybinding(
    measureKey,
    () => {
      graphicsRef.send({ type: 'setMeasureActive', payload: !graphicsRef.getSnapshot().context.isMeasureActive });
    },
    options.in3d,
  );
  useKeybinding(
    gridKey,
    () => {
      graphicsRef.send({ type: 'setGridVisibility', payload: !graphicsRef.getSnapshot().context.enableGrid });
    },
    options.always,
  );
  useKeybinding(
    projectionKey,
    () => {
      const { view, lastPerspectiveVerticalFieldOfView } = cameraRig.actorRef.getSnapshot().context;
      cameraRig.actorRef.send({
        type: 'setVerticalFieldOfView',
        verticalFieldOfView: view.requestedVerticalFieldOfView === 0 ? lastPerspectiveVerticalFieldOfView : 0,
      });
    },
    options.in3d,
  );
  useKeybinding(
    escapeKey,
    () => {
      const { currentMeasurementStart, isMeasureActive } = graphicsRef.getSnapshot().context;
      if (currentMeasurementStart) {
        graphicsRef.send({ type: 'cancelCurrentMeasurement' });
      } else if (isMeasureActive) {
        graphicsRef.send({ type: 'setMeasureActive', payload: false });
      } else {
        graphicsRef.send({ type: 'setSectionViewActive', payload: false });
      }
    },
    options.escape,
  );
  const removeSelectedCut = (): void => {
    const { selectedSectionCutId } = graphicsRef.getSnapshot().context;
    if (selectedSectionCutId !== undefined) {
      graphicsRef.send({ type: 'removeSectionCut', payload: selectedSectionCutId });
    }
  };
  useKeybinding(deleteKey, removeSelectedCut, options.remove);
  useKeybinding(backspaceKey, removeSelectedCut, options.remove);

  return useMemo(() => ({ fitView, section, measure }), [fitView, measure, section]);
};
