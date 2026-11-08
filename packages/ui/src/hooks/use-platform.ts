import { createContext, createElement, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { detectPlatform, serverPlatform } from '#utils/platform.js';
import type { DetectedPlatform } from '#utils/platform.js';

/* The platform cannot change while the document lives, so the store never notifies. */
const subscribe = (): (() => void) => () => undefined;

const getSnapshot = (): DetectedPlatform => detectPlatform();

/* The platform the document request named, when the host detected one. */
const requestPlatformContext = createContext<DetectedPlatform>(serverPlatform);

/**
 * Provide the platform the document request came from (see `detectRequestPlatform` in
 * `@taucad/ui/utils/platform`). Server rendering and hydration below it render shortcut
 * labels for that platform instead of {@link serverPlatform}, so a Windows or Linux visitor's
 * `Ctrl+K` is in the server markup and does not change once the page hydrates.
 *
 * @param properties - The request's platform and the subtree it applies to.
 * @returns The subtree, rendering for that platform until it has hydrated.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React provider exported with its hook in this non-JSX module.
export const RequestPlatformProvider = (properties: {
  readonly platform: DetectedPlatform;
  readonly children?: ReactNode;
}): ReactNode => createElement(requestPlatformContext.Provider, { value: properties.platform }, properties.children);

/**
 * Report the platform a rendered shortcut label belongs to. Server rendering and
 * hydration both report the request's platform from {@link RequestPlatformProvider}, or
 * {@link serverPlatform} without one, whatever the client turns out to be, so
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
  const requestPlatform = useContext(requestPlatformContext);
  return useSyncExternalStore(subscribe, getSnapshot, () => requestPlatform);
}
