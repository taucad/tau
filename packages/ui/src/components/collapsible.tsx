import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Render the APG disclosure pattern. Space or Enter on its trigger toggles the
 * controlled content and updates `aria-expanded`.
 *
 * @public
 * @param properties - Radix collapsible root properties.
 * @returns The collapsible state root.
 *
 * @example <caption>Create a disclosure</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Collapsible } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(Collapsible, { defaultOpen: true });
 * ```
 */
function Collapsible({ ...properties }: React.ComponentProps<typeof CollapsiblePrimitive.Root>): React.JSX.Element {
  return <CollapsiblePrimitive.Root data-slot='collapsible' {...properties} />;
}

/**
 * Render the button that toggles collapsible content.
 *
 * @public
 * @param properties - Radix disclosure-trigger properties.
 * @returns The disclosure trigger.
 *
 * @example <caption>Add a disclosure trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CollapsibleTrigger } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(CollapsibleTrigger, null, 'Details');
 * ```
 */
function CollapsibleTrigger({
  className,
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot='collapsible-trigger'
      className={cn('outline-none focus-visible:focus-outline', className)}
      {...properties}
    />
  );
}

/**
 * Render content whose visibility is controlled by the disclosure root.
 *
 * @public
 * @param properties - Radix disclosure-content properties.
 * @returns The disclosure content.
 *
 * @example <caption>Add disclosure content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CollapsibleContent } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(CollapsibleContent, null, 'Model details');
 * ```
 */
function CollapsibleContent({
  className,
  forceMount,
  onAnimationStart,
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      className={cn(
        // When forceMount is true, use CSS to hide instead of unmounting
        forceMount && 'data-[state=closed]:hidden',
        className,
      )}
      data-slot='collapsible-content'
      forceMount={forceMount ? true : undefined}
      onAnimationStart={(event) => {
        followOpeningHeight(event);
        onAnimationStart?.(event);
      }}
      {...properties}
    />
  );
}

/**
 * Keep the open animation's target equal to the content's real height.
 *
 * Radix measures `--radix-collapsible-content-height` once, as the content
 * opens. Content that renders a frame later (an async highlighter, a query, a
 * lazy child) would animate to that stale height and then snap to its own. So
 * while the content's open animation runs, the target follows the content;
 * the loop ends with the animation, so a settled collapsible costs nothing.
 *
 * @param event - The content's `animationstart` event.
 */
const followOpeningHeight = (event: React.AnimationEvent<HTMLDivElement>): void => {
  const node = event.currentTarget;
  if (event.target !== node || node.dataset['state'] !== 'open') {
    return;
  }
  let target = '';
  const follow = (): void => {
    if (!node.isConnected || node.dataset['state'] !== 'open' || node.getAnimations().length === 0) {
      return;
    }
    const height = `${String(node.scrollHeight)}px`;
    if (height !== target) {
      target = height;
      node.style.setProperty('--radix-collapsible-content-height', height);
    }
    requestAnimationFrame(follow);
  };
  follow();
};

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
