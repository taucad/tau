/**
 * A sidebar row's one status mark (S46, sidebar v2 D2, D16, D20).
 *
 * Five marks for every project and chat state: none, in flight, needs you (with
 * its count), finished while away, failed. The three chat-state marks are one
 * filled-dot family and hue carries the state (D20): a breathing muted disc, an
 * amber disc with a hanging numeral, a blue disc. Failed is the one non-dot, an
 * alert. Every mark is `aria-hidden`, because the sentence a screen reader
 * reads is the row's description, not the icon.
 *
 * Which mark a row shows, and the words it goes with, are decided in
 * `use-sidebar-status.ts` (`selectChatFacts`, `selectProjectFacts`).
 */

import { CircleAlert } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import type { SidebarFacts } from '#hooks/use-sidebar-status.js';
import { Loader } from '#components/ui/loader.js';

const Dot = ({ tone }: { readonly tone: string }): React.JSX.Element => (
  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone)} />
);

const markGlyph = ({ mark, count }: SidebarFacts): React.JSX.Element | undefined => {
  switch (mark) {
    case 'running': {
      /* D20: a muted disc breathing between dark and light grey — never a
       * spinner. Frozen under reduced motion it is a solid grey disc, and hue
       * alone separates it from the blue unread disc; the opt-out is explicit
       * because the app's reset does not reach `animate-pulse`. */
      return <Dot tone='animate-pulse bg-muted-foreground/70 motion-reduce:animate-none' />;
    }
    case 'attention': {
      /* D16: the disc stays dead centre; the count hangs off its lower right
       * so a number never bends the column. */
      return (
        <>
          <Dot tone='bg-warning/80' />
          {count === undefined ? null : (
            <span aria-hidden className='absolute right-0 bottom-0 text-[10px] leading-none font-medium tabular-nums'>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </>
      );
    }
    case 'unread': {
      return <Dot tone='bg-information/80' />;
    }
    case 'failed': {
      return <CircleAlert aria-hidden className='size-3.5 shrink-0' />;
    }
    default: {
      return undefined;
    }
  }
};

const markTone: Record<SidebarFacts['mark'], string> = {
  none: '',
  running: '',
  attention: 'text-warning/80',
  unread: '',
  failed: 'text-destructive/80',
};

/**
 * The mark, in its 24 px slot. The slot renders for `none` too, so a column of
 * rows keeps one straight edge.
 *
 * A row whose route is loading spins in this same slot, over whatever mark it
 * would otherwise show: the loader never sits beside the name, so it cannot
 * move it.
 *
 * @param props - The row's facts, whether its route is loading, and the slot's
 *   class and data slot.
 * @returns The slot.
 * @public
 */
export function StatusMark({
  facts,
  isPending = false,
  className,
  ...props
}: {
  readonly facts: SidebarFacts;
  readonly isPending?: boolean;
  readonly className?: string;
  readonly 'data-slot'?: string;
}): React.JSX.Element {
  return (
    <span
      data-glyph={isPending ? 'pending' : facts.mark}
      className={cn(
        'relative flex size-6 shrink-0 items-center justify-center',
        isPending ? undefined : markTone[facts.mark],
        className,
      )}
      {...props}
    >
      {isPending ? <Loader className='size-3.5' /> : markGlyph(facts)}
    </span>
  );
}
