import { Topic } from '@taucad/events';

/**
 * Tab visibility contract for services that throttle polling when hidden.
 *
 * @public
 * @example <caption>DOM-backed visibility (browser)</caption>
 * ```typescript
 * import { createDomVisibilityProvider } from '@taucad/fs-client/visibility-provider';
 * export function exampleScheduleWhenVisible(scheduleFastPoll: () => void): void {
 *   const visibility = createDomVisibilityProvider();
 *   if (visibility.isVisible()) {
 *     scheduleFastPoll();
 *   }
 * }
 * ```
 */
export type VisibilityProvider = {
  isVisible(): boolean;
  onVisibilityChange(callback: () => void): () => void;
};

/**
 * Always-visible provider for unit tests and non-browser hosts.
 *
 * @public
 * @example <caption>Headless hosts always treat the tab as visible</caption>
 * ```typescript
 * import { headlessVisibilityProvider } from '@taucad/fs-client/visibility-provider';
 * export function exampleHeadlessVisible(): boolean {
 *   return headlessVisibilityProvider.isVisible();
 * }
 * ```
 */
export const headlessVisibilityProvider: VisibilityProvider = {
  isVisible: () => true,
  onVisibilityChange: () => () => undefined,
};

/**
 * Browser implementation backed by `document.visibilityState` and
 * `visibilitychange`.
 *
 * @returns A {@link VisibilityProvider} wired to the current `document`, when present.
 * @public
 */
export function createDomVisibilityProvider(): VisibilityProvider {
  const topic = new Topic<void>({ name: 'document-visibility' });
  const onDocumentVisibilityChange = (): void => {
    topic.emit();
  };
  return {
    isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
    onVisibilityChange(callback: () => void): () => void {
      const isFirst = topic.size === 0;
      const unsubscribe = topic.subscribe(callback);
      if (isFirst && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onDocumentVisibilityChange);
      }
      return () => {
        unsubscribe();
        if (topic.size === 0 && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onDocumentVisibilityChange);
        }
      };
    },
  };
}
