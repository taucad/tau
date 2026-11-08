/**
 * The most a ZIP download asks for in a browser that may hold a large `Blob`
 * in memory: the old in-memory archive's ceiling, now the caller's (S14).
 */
export const inMemoryZipDownloadBytes = 256 * 1024 * 1024;

/**
 * The most a ZIP download asks for in a browser that offers a writable save
 * target: twice the 1 GiB an import may expand to, so any project Tau can
 * import downloads, while a runaway tree still stops with a clear refusal
 * rather than an opaque failure when memory or the disk runs out.
 */
export const savableZipDownloadBytes = 2 * 1024 * 1024 * 1024;

/**
 * The archive options a ZIP download asks for.
 *
 * The archive streams and holds no ceiling of its own; the download still
 * lands in a `Blob`. Offering `showSaveFilePicker` (Chromium's) is taken as a
 * heuristic for a browser that usually pages a large blob to disk, so it gets
 * {@link savableZipDownloadBytes}. It is only a heuristic: an incognito or
 * guest profile has the picker and keeps blobs in memory, and a full disk fails
 * either way, so the ceiling stays finite. Any other browser may hold the whole
 * archive in memory and gets {@link inMemoryZipDownloadBytes}.
 *
 * @param scope - The global the browser's capabilities are read from.
 * @returns The download's `{ maxBytes }`; pass the same value to
 *   `getFileTreeDownloadErrorMessage` so a refusal names it.
 */
export function zipDownloadCeiling(
  scope: Readonly<Record<string, unknown>> = globalThis,
): Readonly<{ maxBytes: number }> {
  return { maxBytes: 'showSaveFilePicker' in scope ? savableZipDownloadBytes : inMemoryZipDownloadBytes };
}
