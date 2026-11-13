/**
 * `environment`: the app runtime's one owner of the page's DOM listeners (app state orchestration charter D4, D5).
 *
 * A callback actor that reports document visibility, window focus and the device's memory class to the runtime root
 * as events; the root folds them and emits each one. The listeners live in this closure, never in a machine's
 * context, and stopping the actor removes them.
 *
 * Not the unload phases (D26): `UnloadProvider` stays the one sequencer of the ordered flush on `hidden`, `pagehide`
 * and quit until A5b moves it here, so this actor neither flushes on `visibilitychange` nor listens for `pagehide`.
 *
 * The memory class is `isMemoryConstrainedDevice`: the web gives a page no memory-pressure signal, and of its two
 * hints only the coarse-pointer media query can change while the page is open.
 */
import { createCallbackLogic } from 'xstate';
import type { CallbackActorLogic, EventObject } from 'xstate';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';

/** What `environment` reports. @public */
export type EnvironmentEvent =
  | { readonly type: 'visibilityChanged'; readonly visible: boolean }
  | { readonly type: 'focusChanged'; readonly focused: boolean }
  | { readonly type: 'memoryClassChanged'; readonly constrained: boolean };

/** The DOM objects `environment` listens to: the browser's in the app, a stand-in in tests. @public */
export type EnvironmentHost = Readonly<{
  document: EventTarget & Readonly<{ visibilityState: DocumentVisibilityState; hasFocus: () => boolean }>;
  window: EventTarget;
  /** The `(pointer: coarse)` media query, whose change can move the memory class. */
  coarsePointer: (EventTarget & Readonly<{ matches: boolean }>) | undefined;
  isMemoryConstrained: () => boolean;
}>;

/**
 * The browser's objects, read when the actor starts; `undefined` where there is no document.
 *
 * @returns The host, or `undefined` outside a browser.
 * @public
 */
export const browserEnvironmentHost = (): EnvironmentHost | undefined =>
  typeof document === 'undefined'
    ? undefined
    : {
        document,
        window: globalThis,
        coarsePointer:
          typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(pointer: coarse)') : undefined,
        isMemoryConstrained: () => isMemoryConstrainedDevice(),
      };

/**
 * Build the `environment` callback logic over one host.
 *
 * @param readHost - Returns the host when the actor starts; the default reads the browser's.
 * @returns The callback logic. It reports the current reading on start and each change after it.
 * @public
 */
export const createEnvironmentLogic = (
  readHost: () => EnvironmentHost | undefined = browserEnvironmentHost,
): CallbackActorLogic<EventObject> =>
  createCallbackLogic<EventObject>(({ sendBack }) => {
    const host = readHost();
    if (host === undefined) {
      return undefined;
    }
    const report = (event: EnvironmentEvent): void => {
      sendBack(event);
    };
    const onVisibilityChange = (): void => {
      report({ type: 'visibilityChanged', visible: host.document.visibilityState !== 'hidden' });
    };
    const onFocus = (): void => {
      report({ type: 'focusChanged', focused: true });
    };
    const onBlur = (): void => {
      report({ type: 'focusChanged', focused: false });
    };
    const onMemoryClassChange = (): void => {
      report({ type: 'memoryClassChanged', constrained: host.isMemoryConstrained() });
    };

    onVisibilityChange();
    report({ type: 'focusChanged', focused: host.document.hasFocus() });
    onMemoryClassChange();

    host.document.addEventListener('visibilitychange', onVisibilityChange);
    host.window.addEventListener('focus', onFocus);
    host.window.addEventListener('blur', onBlur);
    host.coarsePointer?.addEventListener('change', onMemoryClassChange);
    return () => {
      host.document.removeEventListener('visibilitychange', onVisibilityChange);
      host.window.removeEventListener('focus', onFocus);
      host.window.removeEventListener('blur', onBlur);
      host.coarsePointer?.removeEventListener('change', onMemoryClassChange);
    };
  });
