/**
 * The revision surfaces' one actions vocabulary (charter D7; canvas rounds 14–20).
 *
 * Every revision surface — History rows, the chat marker, the orientation strip,
 * Sync, the conflict card and the toasts — draws its verbs with one button, ends
 * a row of verbs with the same More and Details pair, and opens its exact facts
 * with the same Details toggle. One component per idea, so the surfaces cannot
 * drift apart again (L3-F13).
 */
import { Children } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';

/**
 * The shared disclosure motion on `CollapsibleContent`: its height animates
 * from zero, and not at all under reduced motion. Padding belongs to an element
 * inside the content, so the animation starts without a jump.
 */
export const disclosureMotion =
  'overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none';

export type ActionButtonProps = {
  /** The verb, which is the label and, with `short`, the accessible name. */
  readonly verb: string;
  /** The label inside a narrow `ActionsRow` (below 14.5rem); the accessible name stays `verb`. */
  readonly short?: string;
  /** A 14 px glyph leading the verb; a button that only dismisses has none. */
  readonly icon?: LucideIcon;
} & Omit<ComponentProps<typeof Button>, 'size'>;

/**
 * A revision surface's one actions button: extra small, outline unless it is the
 * place's primary, and its verb led by a 14 px glyph.
 *
 * @param props - The verb, its short label and glyph, and the button's own props.
 * @returns The button.
 */
export function ActionButton({
  verb,
  short,
  icon: Icon,
  variant = 'outline',
  children,
  ...properties
}: ActionButtonProps): React.JSX.Element {
  return (
    <Button size='xs' variant={variant} aria-label={short === undefined ? undefined : verb} {...properties}>
      {Icon === undefined ? null : <Icon aria-hidden className='size-3.5' />}
      {short === undefined ? (
        (children ?? verb)
      ) : (
        <>
          <span className='@max-[14.5rem]/actions:hidden'>{verb}</span>
          <span className='hidden @max-[14.5rem]/actions:inline'>{short}</span>
        </>
      )}
    </Button>
  );
}

/**
 * The one way into a surface's exact facts: an outline toggle with a trailing
 * chevron that turns while open. It sits at the right end of the line it belongs
 * to, inside that surface's `Collapsible`, and the facts open directly below.
 *
 * @param props - An optional label other than Details, and classes.
 * @returns The toggle.
 */
export function DetailsToggle({
  label = 'Details',
  className,
}: {
  readonly label?: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <CollapsibleTrigger asChild>
      <Button variant='outline' size='xs' className={cn('group/details', className)}>
        {label}
        <ChevronDown
          aria-hidden
          className='size-3 text-muted-foreground transition-transform group-data-[state=open]/details:rotate-180 motion-reduce:transition-none'
        />
      </Button>
    </CollapsibleTrigger>
  );
}

/**
 * A row of verbs, then More and Details as one pair at its end that never parts.
 *
 * The row is a container: below 14.5rem its verbs take their short labels, and
 * narrower still it stacks the verbs over the pair, both from the left
 * (`justify-between` puts a line's only item at its start), never a zigzag.
 *
 * @param props - The row's slot name, its More, and its verbs.
 * @returns The row; it must sit inside a `Collapsible` that holds its Details.
 */
export function ActionsRow({
  slot,
  end,
  children,
}: {
  readonly slot: string;
  readonly end?: ReactNode;
  readonly children?: ReactNode;
}): React.JSX.Element {
  const hasVerbs = Children.toArray(children).length > 0;
  return (
    <div data-slot={slot} className='@container/actions flex flex-wrap items-center justify-between gap-2'>
      {children}
      <div data-slot='actions-end' className={cn('flex shrink-0 items-center gap-2', !hasVerbs && 'ml-auto')}>
        {end}
        <DetailsToggle />
      </div>
    </div>
  );
}
