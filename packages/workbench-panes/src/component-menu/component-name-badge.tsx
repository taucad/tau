/**
 * The viewer's hover label: the hovered part's name beside the pointer, as the Model pane names it, with what the part
 * does in the mechanism while kinematics is live. {@link useHoveredModelComponentName} reads both from the nearest
 * `GraphicsProvider`; {@link HoveredModelComponentBadge} draws them. Pointer moves arrive at display rate, also through
 * a camera orbit, so {@link placeModelComponentNameBadge} writes the label's position as custom properties straight
 * onto the viewer's layout element and a move never re-renders the viewer; the host keeps only whether the pointer is
 * over the canvas as React state.
 */
import { popoverSurfaceVariants } from '@taucad/ui/components/popover.variants';
import { cn } from '@taucad/ui/utils/cn';
import { useKinematicsSelector, useModelInteractionSelector } from '@taucad/viewer/hooks/use-graphics';
import { describeKinematicsHover, getKinematicsUnitState } from '@taucad/viewer/machines/kinematics.machine';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';

/**
 * Within this distance of the layout's right edge the label flips to the pointer's left: the label's 18rem maximum
 * width plus its 8 px offset from the pointer, so even the longest name it draws never clips past the right edge.
 */
const rightEdgeThresholdPx = 18 * 16 + 8;

/** Within this distance of the bottom controls' top edge the label flips above the pointer. */
const bottomThresholdPx = 56;

/**
 * A pointer position in viewport coordinates.
 *
 * @public
 */
export type ModelComponentNameBadgePoint = {
  readonly clientX: number;
  readonly clientY: number;
};

/**
 * Place the hover label at a pointer position by writing `--viewer-hover-label-*` custom properties on the layout
 * element that positions {@link ModelComponentNameBadge}. The label sits below and right of the pointer, and flips to
 * its left near the layout's right edge and above it near the controls over the canvas.
 *
 * @param layout - The positioned element the badge is drawn in.
 * @param point - The pointer, in viewport coordinates.
 * @param controls - The bar over the bottom of the canvas, read at each move because it grows as tools start; the
 *   layout's bottom edge when there is none.
 * @public
 */
export function placeModelComponentNameBadge(
  layout: HTMLElement,
  point: ModelComponentNameBadgePoint,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- a React ref's `current`, passed as is
  controls?: Element | null,
): void {
  const bounds = layout.getBoundingClientRect();
  const x = Math.max(0, Math.min(point.clientX - bounds.left, bounds.width));
  const y = Math.max(0, Math.min(point.clientY - bounds.top, bounds.height));
  const controlsTop = (controls?.getBoundingClientRect().top ?? bounds.bottom) - bounds.top;
  layout.style.setProperty('--viewer-hover-label-x', `${x}px`);
  layout.style.setProperty('--viewer-hover-label-y', `${y}px`);
  layout.style.setProperty(
    '--viewer-hover-label-translate-x',
    x > bounds.width - rightEdgeThresholdPx ? 'calc(-100% - 8px)' : '8px',
  );
  layout.style.setProperty(
    '--viewer-hover-label-translate-y',
    y > controlsTop - bottomThresholdPx ? 'calc(-100% - 10px)' : '10px',
  );
}

/**
 * Props for {@link ModelComponentNameBadge}.
 *
 * @public
 */
export type ModelComponentNameBadgeProps = {
  /** The hovered part's name, as the Model pane's row names it. */
  readonly componentName: string;
  /** A second, quieter line: what the part does in the mechanism while the Kinematics pane is open. */
  readonly detail?: string;
};

/**
 * The hover label. Draw it inside the layout element {@link placeModelComponentNameBadge} writes to, only while the
 * pointer is over the canvas and a part is hovered, and not while the part menu is open: the menu names its part.
 * It is decorative (the Model pane and the part menu carry the name for assistive technology) and never takes the
 * pointer, so picking and the part menu work through it.
 *
 * @param props - The part's name and the optional detail line.
 * @returns The label.
 * @public
 */
export function ModelComponentNameBadge({ componentName, detail }: ModelComponentNameBadgeProps): React.JSX.Element {
  return (
    <div
      aria-hidden='true'
      data-testid='model-component-name-badge'
      className={cn(
        popoverSurfaceVariants(),
        'pointer-events-none absolute z-20 flex max-w-[min(18rem,calc(100%-1rem))] flex-col px-2 py-1 text-xs',
      )}
      style={{
        left: 'var(--viewer-hover-label-x, 0px)',
        top: 'var(--viewer-hover-label-y, 0px)',
        translate: 'var(--viewer-hover-label-translate-x, 8px) var(--viewer-hover-label-translate-y, 10px)',
      }}
    >
      <span className='truncate font-medium'>{componentName}</span>
      {detail ? <span className='truncate text-muted-foreground'>{detail}</span> : null}
    </div>
  );
}

/**
 * The hovered part, as {@link useHoveredModelComponentName} names it.
 *
 * @public
 */
export type HoveredModelComponentName = {
  /** The part's name, as the Model pane's row names it. */
  readonly name: string;
  /** What the part does in the mechanism, when the unit has a live mechanism that moves it. */
  readonly detail?: string;
};

/**
 * The part the pointer is over in one model unit, read from the nearest `GraphicsProvider`'s model interaction and
 * kinematics actors.
 *
 * @param unitId - The model interaction unit the viewer draws; `undefined` before it has one.
 * @returns The hovered part's name and detail, or `undefined` when no named part is hovered.
 * @public
 */
export function useHoveredModelComponentName(unitId: string | undefined): HoveredModelComponentName | undefined {
  const componentId = useModelInteractionSelector((state) =>
    unitId === undefined ? undefined : getModelInteractionUnitState(state.context, unitId).hoveredComponentId,
  );
  const name = useModelInteractionSelector((state) =>
    unitId === undefined || componentId === undefined
      ? undefined
      : getModelInteractionUnitState(state.context, unitId).manifest?.nodesById[componentId]?.name,
  );
  const detail = useKinematicsSelector((state) =>
    unitId === undefined || componentId === undefined
      ? undefined
      : describeKinematicsHover(getKinematicsUnitState(state.context, unitId), componentId),
  );
  if (name === undefined || name === '') {
    return undefined;
  }
  return detail === undefined ? { name } : { name, detail };
}

/**
 * Props for {@link HoveredModelComponentBadge}.
 *
 * @public
 */
export type HoveredModelComponentBadgeProps = {
  /** The model interaction unit the viewer draws; `undefined` before it has one. */
  readonly unitId: string | undefined;
  /**
   * Hides the label: while the pointer is off the canvas, while the part menu is open (it names its part) or while
   * the viewer draws no model.
   */
  readonly isSuppressed: boolean;
};

/**
 * The hover label for the part under the pointer, inside the layout element {@link placeModelComponentNameBadge}
 * writes to. Both the Tau app's viewer and the agent plugin's viewer page draw this one component.
 *
 * @param props - The unit and whether the label is suppressed.
 * @returns The label, or nothing while suppressed or with no named part hovered.
 * @public
 */
export function HoveredModelComponentBadge({
  unitId,
  isSuppressed,
}: HoveredModelComponentBadgeProps): React.JSX.Element | undefined {
  const hovered = useHoveredModelComponentName(unitId);
  return isSuppressed || hovered === undefined ? undefined : (
    <ModelComponentNameBadge componentName={hovered.name} detail={hovered.detail} />
  );
}
