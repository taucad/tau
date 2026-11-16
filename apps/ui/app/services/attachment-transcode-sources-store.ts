/**
 * The image formats the composer converts, as a store the composer reads while it renders (the picker's `accept`) and
 * the draft's image step (`attachment-image.actor.ts`) reads before it converts. The list itself,
 * `runtime/attachment-transcode-sources.ts`, is loaded on first use; no worker starts.
 *
 * Kept apart from `attachment-image.service.ts`, so the composer's static import graph, which is on Home's critical
 * path, does not carry the conversion service.
 *
 * @module
 */

import { Topic } from '@taucad/events';

const importTranscodeSources = async (): Promise<readonly string[]> => {
  const { attachmentTranscodeSources } = await import('#runtime/attachment-transcode-sources.js');
  return attachmentTranscodeSources;
};

let sources: Promise<readonly string[]> | undefined;
const noSources: readonly string[] = [];
let loadedSources = noSources;
const sourcesLoaded = new Topic<readonly string[]>({ name: 'attachment-transcode-sources' });

/**
 * The image formats the composer converts: the conversion runtime's edges to `jpeg`, as
 * `attachment-transcode-sources.ts` lists them. The list is loaded on first use, outside the entry's static import
 * graph; no worker starts. A failed load admits only stored types and is retried on the next call.
 *
 * @returns The convertible source formats.
 */
export const loadAttachmentTranscodeSources = async (): Promise<readonly string[]> => {
  sources ??= importTranscodeSources();
  let loaded: readonly string[];
  try {
    loaded = await sources;
  } catch {
    sources = undefined;
    return noSources;
  }
  if (loadedSources !== loaded) {
    loadedSources = loaded;
    sourcesLoaded.emit(loaded);
  }
  return loaded;
};

/**
 * Subscribe to the convertible formats, starting their load (`useSyncExternalStore`).
 *
 * @param listener - Called once the list has loaded.
 * @returns The unsubscribe.
 */
export const subscribeAttachmentTranscodeSources = (listener: () => void): (() => void) => {
  const unsubscribe = sourcesLoaded.subscribe(() => {
    listener();
  });
  void loadAttachmentTranscodeSources();
  return unsubscribe;
};

/**
 * The convertible formats loaded so far: empty until {@link loadAttachmentTranscodeSources} first settles.
 *
 * @returns The current list; the same array until it changes.
 */
export const attachmentTranscodeSourcesSnapshot = (): readonly string[] => loadedSources;

/** The server and pre-load snapshot: nothing converts until the list has loaded. */
export const noAttachmentTranscodeSources = (): readonly string[] => noSources;
