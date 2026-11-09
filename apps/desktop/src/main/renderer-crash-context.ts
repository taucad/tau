/**
 * The dead page's context on a renderer crash report (browser observability D13).
 *
 * On desktop the native minidump is the one report of a renderer crash. The renderer keeps its kill context (route,
 * last activity, live counts, device class) on its Sentry scope (`#lib/memory-kill-signal` in apps/ui), and
 * `@sentry/electron` syncs renderer scope tags to main. The SDK reads main's scope only when it uploads the minidump,
 * after Electron has handed it the crash file, and by then the reloaded page may already have replaced those tags and
 * added its own breadcrumbs. So main snapshots the tags the moment the renderer goes, and the processor puts that
 * snapshot back on the crash event and drops the breadcrumbs recorded after it.
 *
 * Pure: `error-reporting.ts` takes the snapshot and installs the processor.
 */
import type { Event } from '@sentry/electron/main';

/** The renderer scope tags a crash report keeps from the moment the renderer went. */
export const rendererCrashTagNames = [
  'route',
  'last_activity',
  'live_project_count',
  'chat_count',
  'device_class',
] as const;

/** Milliseconds: a crash event later than this after the renderer went is not that renderer's. */
export const rendererCrashSnapshotLifetime = 120_000;

/** Main's view of the renderer when it went. */
export type RendererGoneSnapshot = Readonly<{
  /** When the renderer went, in milliseconds since the epoch. */
  at: number;
  tags: Readonly<Record<string, string>>;
}>;

/**
 * Snapshot the renderer's crash tags from main's scope tags.
 *
 * @param scopeTags - Main's scope tags now, holding what the renderer last synced.
 * @param at - When the renderer went.
 * @returns The snapshot; its tags hold only the names in {@link rendererCrashTagNames} that had a value.
 */
export const snapshotRendererGone = (
  scopeTags: Readonly<Record<string, unknown>>,
  at: number,
): RendererGoneSnapshot => {
  const tags: Record<string, string> = {};
  for (const name of rendererCrashTagNames) {
    const value = scopeTags[name];
    if (typeof value === 'string' && value !== '') {
      tags[name] = value;
    }
  }
  return { at, tags };
};

/**
 * Whether an event is a renderer's native minidump. Main's own `Renderer gone` signal is captured synchronously while
 * the dead page's tags are still on the scope, so it needs no snapshot.
 */
const isRendererMinidump = (event: Event): boolean =>
  event.platform === 'native' && event.tags?.['event.process'] === 'renderer';

/**
 * Put the snapshot back on a renderer's minidump event, once.
 *
 * @param event - The event about to be sent.
 * @param snapshot - Main's view of the renderer when it last went, if any.
 * @param now - The time now, in milliseconds since the epoch.
 * @returns The event, with the snapshot's tags over the scope's and no breadcrumb later than the crash, and whether
 * the snapshot was spent on it.
 */
export const applyRendererGoneSnapshot = <Reported extends Event>(
  event: Reported,
  snapshot: RendererGoneSnapshot | undefined,
  now: number,
): Readonly<{ event: Reported; spent: boolean }> => {
  if (
    snapshot === undefined ||
    !isRendererMinidump(event) ||
    now < snapshot.at ||
    now - snapshot.at > rendererCrashSnapshotLifetime
  ) {
    return { event, spent: false };
  }
  const crashedAtSeconds = snapshot.at / 1000;
  const scopeTags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([name]) => !(rendererCrashTagNames as readonly string[]).includes(name)),
  );
  return {
    event: {
      ...event,
      tags: { ...scopeTags, ...snapshot.tags },
      ...(event.breadcrumbs === undefined
        ? {}
        : {
            breadcrumbs: event.breadcrumbs.filter(
              (breadcrumb) => breadcrumb.timestamp === undefined || breadcrumb.timestamp <= crashedAtSeconds,
            ),
          }),
    },
    spent: true,
  };
};
