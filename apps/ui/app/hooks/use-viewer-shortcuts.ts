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
 * then stops Section; Delete and Backspace remove the cut of the chip holding focus, else the selected cut. S, M and
 * P are off for 2D geometry. Each shortcut passes a short phrase for its result to `announce`, which the bar speaks.
 *
 * Keys typed into a field never reach these bindings, and every viewer registers its own set, gated by
 * {@link isViewerKeyTarget} on `barRef`. The bindings keep the default priority, below a drag's Escape.
 */
export const useViewerShortcuts = (
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  barRef: RefObject<HTMLElement | null>,
  announce: (phrase: string) => void,
): ViewerShortcutKeys => {
  const graphicsRef = useGraphics();
  const cameraRig = useCameraRig();

  const options = useMemo(() => {
    const isTarget = (): boolean => isViewerKeyTarget(barRef.current ?? undefined);
    const context = () => graphicsRef.getSnapshot().context;
    // The cut of the chip in this bar holding focus, which focus previews in the scene, else the selected cut.
    const resolveCutToRemove = (): string | undefined => {
      const chip = document.activeElement?.closest<HTMLElement>('[data-section-chip]');
      const focusedCutId = chip && barRef.current?.contains(chip) ? chip.dataset['sectionChip'] : undefined;
      return focusedCutId ?? context().selectedSectionCutId;
    };
    return {
      resolveCutToRemove,
      always: { ignoreInputs: true, enabled: isTarget },
      in3d: { ignoreInputs: true, enabled: () => isTarget() && context().artifact?.mimeType !== 'image/svg+xml' },
      escape: {
        ignoreInputs: true,
        enabled: () => isTarget() && (context().isMeasureActive || context().isSectionViewActive),
      },
      remove: {
        ignoreInputs: true,
        enabled: () => isTarget() && context().isSectionViewActive && resolveCutToRemove() !== undefined,
      },
    };
  }, [barRef, graphicsRef]);

  const { formattedKeyCombination: fitView } = useKeybinding(
    fitViewKey,
    () => {
      graphicsRef.send({ type: 'fitView' });
      announce('Fitted to view');
    },
    options.always,
  );
  const { formattedKeyCombination: section } = useKeybinding(
    sectionKey,
    () => {
      const isActive = !graphicsRef.getSnapshot().context.isSectionViewActive;
      graphicsRef.send({
        type: 'setSectionViewActive',
        payload: isActive,
        viewDirection: cameraRig.actorRef.getSnapshot().context.view.direction,
      });
      announce(isActive ? 'Section on' : 'Section off');
    },
    options.in3d,
  );
  const { formattedKeyCombination: measure } = useKeybinding(
    measureKey,
    () => {
      const isActive = !graphicsRef.getSnapshot().context.isMeasureActive;
      graphicsRef.send({ type: 'setMeasureActive', payload: isActive });
      announce(isActive ? 'Measure on' : 'Measure off');
    },
    options.in3d,
  );
  useKeybinding(
    gridKey,
    () => {
      const isShown = !graphicsRef.getSnapshot().context.enableGrid;
      graphicsRef.send({ type: 'setGridVisibility', payload: isShown });
      announce(isShown ? 'Grid shown' : 'Grid hidden');
    },
    options.always,
  );
  useKeybinding(
    projectionKey,
    () => {
      const { view, lastPerspectiveVerticalFieldOfView } = cameraRig.actorRef.getSnapshot().context;
      const isOrthographic = view.requestedVerticalFieldOfView === 0;
      cameraRig.actorRef.send({
        type: 'setVerticalFieldOfView',
        verticalFieldOfView: isOrthographic ? lastPerspectiveVerticalFieldOfView : 0,
      });
      announce(isOrthographic ? 'Perspective' : 'Orthographic');
    },
    options.in3d,
  );
  useKeybinding(
    escapeKey,
    () => {
      const { currentMeasurementStart, isMeasureActive } = graphicsRef.getSnapshot().context;
      if (currentMeasurementStart) {
        graphicsRef.send({ type: 'cancelCurrentMeasurement' });
        announce('Point cancelled');
      } else if (isMeasureActive) {
        graphicsRef.send({ type: 'setMeasureActive', payload: false });
        announce('Measure off');
      } else {
        graphicsRef.send({ type: 'setSectionViewActive', payload: false });
        announce('Section off');
      }
    },
    options.escape,
  );
  const removeCut = (): void => {
    const cutId = options.resolveCutToRemove();
    if (cutId !== undefined) {
      graphicsRef.send({ type: 'removeSectionCut', payload: cutId });
      announce('Cut removed');
    }
  };
  useKeybinding(deleteKey, removeCut, options.remove);
  useKeybinding(backspaceKey, removeCut, options.remove);

  return useMemo(() => ({ fitView, section, measure }), [fitView, measure, section]);
};
