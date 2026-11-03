import { useSyncExternalStore } from 'react';
import { detectPlatform, serverPlatform } from '#utils/platform.js';
import type { DetectedPlatform } from '#utils/platform.js';

/* The platform cannot change while the document lives, so the store never notifies. */
const subscribe = (): (() => void) => () => undefined;

const getSnapshot = (): DetectedPlatform => detectPlatform();

const getServerSnapshot = (): DetectedPlatform => serverPlatform;

/**
 * Report the platform a rendered shortcut label belongs to. Server rendering and
 * hydration both report {@link serverPlatform}, whatever the client turns out to be, so
 * the markup a subtree hydrates against always matches what it renders; React re-renders
 * with the detected platform once that subtree has hydrated. Reading `detectPlatform`
 * during a render instead leaves a subtree that hydrates late rendering `Ctrl+K` against
 * the `⌘K` the server sent, which React reports as a hydration mismatch and regenerates.
 *
 * @returns The platform to format shortcut labels and `aria-keyshortcuts` for.
 * @public
 *
 * @example <caption>Label a shortcut without breaking hydration</caption>
 * ```tsx
 * import { usePlatform } from '@taucad/ui/hooks/use-platform';
 * import { formatKeyCombination } from '@taucad/ui/utils/keys';
 *
 * export const SaveHint = (): React.JSX.Element => (
 *   <kbd>{formatKeyCombination({ key: 's', modKey: true }, usePlatform())}</kbd>
 * );
 * ```
 */
export function usePlatform(): DetectedPlatform {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
