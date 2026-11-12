import type { TourStepId } from '@taucad/preferences';
import type { CoachMarkAnchor } from '@taucad/ui/components/coach-mark';
import type { TourAnchorId, TourAnchorRegistry } from '#components/tour/tour-anchors.js';

/** Which side of its anchor a tip opens on, and how it lines up. */
export type TourSide = 'top' | 'right' | 'bottom' | 'left';
export type TourAlign = 'start' | 'center' | 'end';

/**
 * Where a tip is placed: beside its target; beside the control that brings the target on screen, with "Show me"; or,
 * when neither is on screen, at the bottom centre of the window with only its text and Next.
 */
export type TourPlacement = Readonly<{
  kind: 'target' | 'reveal' | 'fallback';
  anchor: CoachMarkAnchor;
  /** The control "Show me" operates, for a tip placed beside it. */
  revealId?: TourAnchorId;
  side: TourSide;
  align: TourAlign;
}>;

type StepAnchors = Readonly<{
  target: TourAnchorId;
  /** Tried in order when the target is not on screen. */
  reveals: readonly TourAnchorId[];
  side: TourSide;
  align: TourAlign;
}>;

/** What placement needs to know about the editor. */
export type TourPlacementFacts = Readonly<{
  /** The transcript holds a row with a test run, so Verify points at it rather than at the composer. */
  hasTestRun: boolean;
  /** Below the four-lane layout there is no room beside a target: tips sit above or below it. */
  isNarrow: boolean;
}>;

/**
 * Each tip's target and reveal controls. On the phone layout one region shows at a time, so the tab-bar entry for the
 * target's region is the last reveal control.
 *
 * @param step - The tip.
 * @param facts - The editor facts placement reads.
 * @returns The tip's anchors.
 */
export const tourStepAnchors = (step: TourStepId, facts: Pick<TourPlacementFacts, 'hasTestRun'>): StepAnchors => {
  switch (step) {
    case 'ask': {
      return { target: 'composer', reveals: ['mobile-tab-chat'], side: 'right', align: 'end' };
    }
    case 'look': {
      return { target: 'viewer', reveals: ['mobile-tab-model'], side: 'bottom', align: 'start' };
    }
    case 'adjust': {
      return {
        target: 'parameters',
        reveals: ['workbench-open-tab', 'mobile-tab-parameters'],
        side: 'left',
        align: 'start',
      };
    }
    case 'verify': {
      return facts.hasTestRun
        ? { target: 'activity-test', reveals: ['chat-lane', 'mobile-tab-chat'], side: 'right', align: 'start' }
        : { target: 'composer', reveals: ['mobile-tab-chat'], side: 'right', align: 'end' };
    }
    case 'build': {
      return { target: 'export', reveals: ['workbench-open-tab', 'mobile-tab-all'], side: 'bottom', align: 'end' };
    }
  }
};

/** How far into the viewer Look around's corner sits, so the tip hangs inside it, opposite the gizmo. */
const viewerCornerInset = { left: 12, top: 8 } as const;

const elementAnchor = (element: HTMLElement): CoachMarkAnchor => element;

/**
 * A point inside the viewer's top-left corner. The tip hangs from it rather than beside the viewer, because its target
 * is the viewer itself.
 *
 * @param element - The viewer.
 * @returns A point that follows the viewer as it moves.
 */
const viewerCorner = (element: HTMLElement): CoachMarkAnchor => ({
  getBoundingClientRect: () => {
    const rect = element.getBoundingClientRect();
    return new DOMRect(rect.left + viewerCornerInset.left, rect.top + viewerCornerInset.top, 0, 0);
  },
});

/**
 * The bottom centre of the window the editor is in.
 *
 * @param view - That window.
 * @returns A point that follows the window's size.
 */
export const bottomCentre = (view: Pick<Window, 'innerWidth' | 'innerHeight'>): CoachMarkAnchor => ({
  getBoundingClientRect: () => new DOMRect(view.innerWidth / 2, view.innerHeight - 16, 0, 0),
});

/**
 * Place a tip: its target, else its first reveal control on screen, else the bottom centre of the window. A closed
 * pane, a narrow layout or a scrolled transcript therefore never stalls the tour.
 *
 * @param input - The tip, the anchors on screen, the editor facts placement reads, and the window for the last
 *   fallback.
 * @returns The placement.
 */
export const resolveTourPlacement = ({
  step,
  registry,
  facts,
  view,
}: Readonly<{
  step: TourStepId;
  registry: TourAnchorRegistry | undefined;
  facts: TourPlacementFacts;
  view: Pick<Window, 'innerWidth' | 'innerHeight'>;
}>): TourPlacement => {
  const anchors = tourStepAnchors(step, facts);
  const narrowSide = (side: TourSide): TourSide =>
    side === 'left' || side === 'right' ? (step === 'ask' || anchors.target === 'composer' ? 'top' : 'bottom') : side;
  const placeBeside = (side: TourSide, align: TourAlign): Pick<TourPlacement, 'side' | 'align'> =>
    facts.isNarrow ? { side: narrowSide(side), align: step === 'look' ? 'start' : 'center' } : { side, align };
  const target = registry?.isVisible(anchors.target) === true ? registry.element(anchors.target) : undefined;
  if (target !== undefined) {
    return {
      kind: 'target',
      anchor: step === 'look' ? viewerCorner(target) : elementAnchor(target),
      ...placeBeside(anchors.side, anchors.align),
    };
  }
  for (const revealId of anchors.reveals) {
    const reveal = registry?.isVisible(revealId) === true ? registry.element(revealId) : undefined;
    if (reveal !== undefined) {
      /* The phone's tab bar sits at the bottom of the screen; every other reveal control sits in a header. */
      const side = revealId.startsWith('mobile-tab-') ? 'top' : 'bottom';
      return {
        kind: 'reveal',
        anchor: elementAnchor(reveal),
        revealId,
        side,
        align: facts.isNarrow ? 'center' : 'start',
      };
    }
  }
  return { kind: 'fallback', anchor: bottomCentre(view), side: 'top', align: 'center' };
};
