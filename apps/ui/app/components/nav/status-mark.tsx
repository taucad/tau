/**
 * A sidebar row's one status mark (S46, sidebar v2 D2, D9, D16).
 *
 * Five marks for every project and chat state: none, in flight, needs you (with
 * its count), finished while away, failed. Shape carries each one, never hue
 * alone — a hollow ring, a centred disc with a hanging numeral, a filled dot,
 * an alert — and every mark is `aria-hidden`, because the sentence a screen
 * reader reads is the row's description, not the icon.
 *
 * Which mark a row shows, and the words it goes with, are decided in
 * `use-sidebar-status.ts` (`selectChatFacts`, `selectProjectFacts`).
 */

import { Circle, CircleAlert, CircleDot } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import type { SidebarFacts } from '#hooks/use-sidebar-status.js';

const markGlyph = ({ mark, count }: SidebarFacts): React.JSX.Element | undefined => {
  switch (mark) {
    case 'running': {
      /* D9: a pulsing muted ring, not a spinner and not a disc. The ring is
       * permanent, so shape — not motion — separates it from the finished
       * dot; the reduced-motion opt-out is explicit because the app's reset
       * does not reach `animate-pulse`. */
      return (
        <span
          aria-hidden
          className='size-2 shrink-0 animate-pulse rounded-full ring-1 ring-muted-foreground motion-reduce:animate-none'
        />
      );
    }
    case 'attention': {
      /* D16: the disc stays dead centre; the count hangs off its lower right
       * so a number never bends the column. */
      return (
        <>
          <CircleDot aria-hidden className='size-3 shrink-0' />
          {count === undefined ? null : (
            <span aria-hidden className='absolute right-0 bottom-0 text-[10px] leading-none font-medium tabular-nums'>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </>
      );
    }
    case 'unread': {
      return <Circle aria-hidden className='size-2 shrink-0 fill-current' />;
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
  attention: 'text-warning',
  unread: 'text-foreground',
  failed: 'text-destructive',
};

/**
 * The mark, in its 24 px slot. The slot renders for `none` too, so a column of
 * rows keeps one straight edge.
 *
 * @param props - The row's facts, and the slot's class and data slot.
 * @returns The slot.
 * @public
 */
export function StatusMark({
  facts,
  className,
  ...props
}: {
  readonly facts: SidebarFacts;
  readonly className?: string;
  readonly 'data-slot'?: string;
}): React.JSX.Element {
  return (
    <span
      data-glyph={facts.mark}
      className={cn('relative flex size-6 shrink-0 items-center justify-center', markTone[facts.mark], className)}
      {...props}
    >
      {markGlyph(facts)}
    </span>
  );
}
