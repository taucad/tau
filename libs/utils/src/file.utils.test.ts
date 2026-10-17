// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { asBuffer, downloadBlob, sourcePathMatchesExtensions } from '#file.utils.js';

describe('sourcePathMatchesExtensions', () => {
  it('matches full dotted suffixes case-insensitively', () => {
    expect(sourcePathMatchesExtensions('models/part.MESH.XML', ['mesh.xml'])).toBe(true);
    expect(sourcePathMatchesExtensions('models/notes.xml', ['mesh.xml'])).toBe(false);
    expect(sourcePathMatchesExtensions('models/partts', ['ts'])).toBe(false);
    expect(sourcePathMatchesExtensions('models/no-extension', ['*'])).toBe(true);
  });
});

describe('asBuffer', () => {
  it('should return Uint8Array unchanged', () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = asBuffer(data);
    expect(result).toBe(data);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should return ArrayBuffer unchanged', () => {
    const data = new ArrayBuffer(8);
    const result = asBuffer(data);
    expect(result).toBe(data);
  });
});

describe('downloadBlob', () => {
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'append').mockImplementation(() => undefined as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('should create an anchor element and trigger download', async () => {
    const blob = new Blob(['test content'], { type: 'text/plain' });

    downloadBlob(blob, 'test-file.txt');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

    await vi.waitFor(() => {
      expect(mockAnchor.download).toBe('test-file.txt');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.remove).toHaveBeenCalled();
    });
  });

  it('should append anchor to body before clicking', async () => {
    const blob = new Blob(['data']);

    downloadBlob(blob, 'output.bin');

    await vi.waitFor(() => {
      expect(document.body.append).toHaveBeenCalledWith(mockAnchor);
      expect(mockAnchor.click).toHaveBeenCalled();
    });
  });

  /* D-UI-13 (B-18): the download is the blob itself. A base64 data URL is a
   * second, 1.33× copy of the export in the JS heap, plus the decoded string. */
  it('should download through the object URL, never a base64 data URL', () => {
    const readAsDataUrl = vi.spyOn(FileReader.prototype, 'readAsDataURL');

    downloadBlob(new Blob(['data']), 'file.txt');

    expect(mockAnchor.href).toBe('blob:mock-url');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(readAsDataUrl).not.toHaveBeenCalled();
  });

  it('should revoke the object URL only after the download has had time to start', () => {
    vi.useFakeTimers();
    try {
      downloadBlob(new Blob(['data']), 'file.txt');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.useRealTimers();
    }
  });
});
