import { describe, expect, it } from 'vitest';
import { inMemoryZipDownloadBytes, savableZipDownloadBytes, zipDownloadCeiling } from '#utils/zip-download.utils.js';

describe('zipDownloadCeiling', () => {
  it('should ask for the generous ceiling where the browser offers a writable save target', () => {
    expect(zipDownloadCeiling({ showSaveFilePicker: () => undefined })).toEqual({ maxBytes: savableZipDownloadBytes });
    expect(savableZipDownloadBytes).toBe(2 * 1024 * 1024 * 1024);
  });

  it('should ask for the in-memory ceiling anywhere else', () => {
    expect(zipDownloadCeiling({})).toEqual({ maxBytes: inMemoryZipDownloadBytes });
    expect(inMemoryZipDownloadBytes).toBe(256 * 1024 * 1024);
  });
});
