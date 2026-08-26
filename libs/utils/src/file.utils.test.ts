// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { asBuffer, downloadBlob } from '#file.utils.js';

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
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

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

  it('should revoke the object URL even when reader is asynchronous', () => {
    const blob = new Blob(['data']);

    downloadBlob(blob, 'file.txt');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
