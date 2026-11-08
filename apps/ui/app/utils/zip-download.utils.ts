/**
 * The most a ZIP download holds in a browser that keeps a large `Blob` in
 * memory: the old in-memory archive's ceiling, now the caller's (S14).
 */
export const inMemoryZipDownloadBytes = 256 * 1024 * 1024;

/**
 * The archive options a ZIP download asks for.
 *
 * The archive streams and holds no ceiling of its own; the download still
 * lands in a `Blob`. A browser that offers a writable save target
 * (`showSaveFilePicker`, Chromium's) also pages large blobs to disk, so it asks
 * for none; any other may hold the whole archive in memory, so it asks for
 * {@link inMemoryZipDownloadBytes}.
 *
 * @param scope - The global the browser's capabilities are read from.
 * @returns `{ maxBytes }` where the download needs a ceiling, else `{}`.
 */
export function zipDownloadCeiling(
  scope: Readonly<Record<string, unknown>> = globalThis,
): Readonly<{ maxBytes?: number }> {
  return 'showSaveFilePicker' in scope ? {} : { maxBytes: inMemoryZipDownloadBytes };
}
