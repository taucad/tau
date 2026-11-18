/**
 * The persistent safe-mode bar (desktop resilient startup blueprint, D0; R12). Shown for the whole page load that
 * started in safe mode, on the web (`?safe=1`) and on desktop, and says why it started. Safe mode is never stored: the
 * next normal start drops the bar.
 */
import { ShieldAlert } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { desktopSafeMode, desktopTroubleshooting } from '#lib/desktop-safe-mode.js';
import type { SafeModeReason } from '#lib/desktop-safe-mode.js';

const reasonCopy: Record<SafeModeReason, string> = {
  requested: 'You started Tau in safe mode. Only Home is open; other folders are not connected.',
  'unhealthy-launches': 'Tau did not start properly last time, so it started in safe mode. Only Home is open.',
};

/**
 * The safe-mode bar.
 *
 * @param props - Why safe mode started, and an optional action (desktop: the recovery panel).
 * @returns The bar.
 * @public
 */
export function SafeModeBar({
  reason,
  children,
}: {
  readonly reason: SafeModeReason;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role='status'
      aria-label='Safe mode'
      data-slot='safe-mode-bar'
      className='fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t bg-background/95 px-4 py-2 text-sm backdrop-blur'
    >
      <ShieldAlert aria-hidden className='size-4 shrink-0 text-feature' />
      <span className='font-medium'>Safe mode</span>
      <span className='text-muted-foreground'>{reasonCopy[reason]}</span>
      {children ?? (
        /* A document load without the parameter is a normal start. */
        <a href='/' className='underline underline-offset-2'>
          Restart normally
        </a>
      )}
    </div>
  );
}

/**
 * The desktop bar's exits: the recovery panel (main's recovery window) and a normal restart. A shell whose preload
 * lacks a call shows no button for it.
 *
 * @returns The actions.
 * @public
 */
export function DesktopSafeModeActions(): React.JSX.Element {
  const troubleshooting = desktopTroubleshooting();
  const open = troubleshooting?.open;
  const restartNormally = troubleshooting?.restartNormally;
  return (
    <>
      {open === undefined ? undefined : (
        <button
          type='button'
          className='underline underline-offset-2'
          onClick={() => {
            void open();
          }}
        >
          Open Recovery…
        </button>
      )}
      {restartNormally === undefined ? undefined : (
        <button
          type='button'
          className='underline underline-offset-2'
          onClick={() => {
            void restartNormally();
          }}
        >
          Restart normally
        </button>
      )}
    </>
  );
}

/* Safe mode is fixed for the page load, so there is nothing to subscribe to. */
const subscribeNever = (): (() => void) => () => undefined;

/**
 * The bar for this page load, when it started in safe mode: desktop's reason from the preload, else `requested` for
 * `?safe=1`. Both are read in the browser only, so the server document and the hydrating render carry no bar and
 * hydration agrees; React renders the bar right after (the `useClientFact` pattern of `#lib/client-facts`).
 *
 * @param props - Whether this runtime was started with `?safe=1`.
 * @returns The bar, or nothing for a normal load and before hydration.
 * @public
 */
export function SafeModeNotice({ isRequested }: { readonly isRequested: boolean }): React.JSX.Element | undefined {
  const reason = useSyncExternalStore(
    subscribeNever,
    (): SafeModeReason | undefined => desktopSafeMode()?.reason ?? (isRequested ? 'requested' : undefined),
    () => undefined,
  );
  if (reason === undefined) {
    return undefined;
  }
  return (
    <SafeModeBar reason={reason}>
      {desktopSafeMode() === undefined ? undefined : <DesktopSafeModeActions />}
    </SafeModeBar>
  );
}
