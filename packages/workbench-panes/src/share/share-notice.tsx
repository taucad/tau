import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

/**
 * Properties of {@link ShareNotice}.
 *
 * @public
 */
export type ShareNoticeProperties = Readonly<{
  /** What the notice says: `info` for a normal state, `warning` for a caveat, `error` for something that went wrong. */
  tone: 'info' | 'warning' | 'error';
  /** A first line in medium weight, for a state that needs a name. */
  title?: string;
  /** Defaults: `alert` for `error`, `status` for `warning`, none for `info`. */
  role?: 'alert' | 'status';
  children: ReactNode;
  /** Content-sized buttons, right-aligned on a row under the text. */
  actions?: ReactNode;
}>;

const toneGlyphs = {
  info: { Icon: Info, className: 'text-muted-foreground' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  error: { Icon: CircleAlert, className: 'text-feature' },
} as const;

const defaultRoles = { info: undefined, warning: 'status', error: 'alert' } as const;

/**
 * One notice in the Share pane: a neutral surface whose leading glyph carries the tone, the words in the foreground
 * color, and optional actions under them. Errors are announced as alerts and warnings as status by default.
 *
 * @param props - The tone, an optional title and role, the words and the actions.
 * @returns A neutral row with the tone's glyph, the words and the actions.
 * @public
 * @example <caption>Report a failed copy.</caption>
 * ```tsx
 * import { ShareNotice } from '@taucad/workbench-panes/share/share-notice';
 *
 * <ShareNotice tone='error'>Couldn't copy the link. Select it above and copy it.</ShareNotice>;
 * ```
 */
export function ShareNotice({ tone, title, role, children, actions }: ShareNoticeProperties): React.JSX.Element {
  const { Icon, className } = toneGlyphs[tone];
  return (
    <div
      data-slot='share-notice'
      data-tone={tone}
      role={role ?? defaultRoles[tone]}
      className='flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground'
    >
      <div className='flex items-start gap-2'>
        <span className='flex h-lh shrink-0 items-center'>
          <Icon aria-hidden className={cn('size-4', className)} />
        </span>
        <div className='flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]'>
          {title === undefined ? null : <p className='font-medium'>{title}</p>}
          <div>{children}</div>
        </div>
      </div>
      {actions === undefined ? null : <div className='flex flex-wrap justify-end gap-2'>{actions}</div>}
    </div>
  );
}
