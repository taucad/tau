import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClipboardImageFiles, handleClipboardImagePaste } from '#components/chat-paste-handler.js';
import type { AttachmentIntakeRefusal } from '#utils/attachment-intake.js';

/** A PNG header: intake labels a pasted file from its bytes, so every image fixture must hold real image bytes. */
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x30, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00,
]);
const jpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0x01, 0x22, 0x00,
]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00,
  0x00, 0x2f, 0x2f, 0xc0, 0x07, 0x00,
]);

const pdfLike = new TextEncoder().encode('%PDF-1.7\n');

/** A 48×32, 24-bit BMP header: a format Tau converts but does not store. */
const bmpBytes = (() => {
  const bytes = new Uint8Array(58);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, 58, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, 48, true);
  view.setInt32(22, 32, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  return bytes;
})();

/** A real HEIC photo: some pickers and clipboards type it `application/octet-stream`. */
const heicBytes = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, '../../../../../libs/utils/src/image-probe.fixtures/small.heic')),
);

/** A 32×48, 8-bit Photoshop header: recognised, never stored or converted. */
const psdBytes = (() => {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('8BPS'));
  view.setUint16(4, 1);
  view.setUint16(12, 3);
  view.setUint32(14, 32);
  view.setUint32(18, 48);
  view.setUint16(22, 8);
  return bytes;
})();

// The jsdom File has no `arrayBuffer`; every browser the app supports does.
const makeFile = (name: string, type = 'image/png', bytes: Uint8Array<ArrayBuffer> = pngBytes): File =>
  Object.assign(new File([new Blob(['stub'])], name, { type }), {
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

const makeItem = (file: File): DataTransferItem => ({
  kind: 'file',
  type: file.type,
  getAsFile: () => file,
  getAsString: () => undefined,
  webkitGetAsEntry: () => null,
});

const makeItemList = (items: readonly DataTransferItem[]): DataTransferItemList => {
  const list = [...items] as DataTransferItem[];
  return Object.assign(list, {
    add: () => null,
    clear: () => undefined,
    item: (index: number) => list[index] ?? null,
    remove: () => undefined,
  }) as DataTransferItemList;
};

const makeFileList = (files: readonly File[]): FileList => {
  const list = [...files] as File[];
  return Object.assign(list, {
    item: (index: number) => list[index] ?? null,
  }) as FileList;
};

const makeClipboardData = ({
  items,
  files = [],
}: {
  readonly items: readonly DataTransferItem[];
  readonly files?: readonly File[];
}): DataTransfer => {
  const clipboardData: DataTransfer = {
    dropEffect: 'none',
    effectAllowed: 'none',
    types: ['Files'],
    items: makeItemList(items),
    files: makeFileList(files),
    clearData: () => undefined,
    getData: () => '',
    setData: () => undefined,
    setDragImage: () => undefined,
  };
  return clipboardData;
};

describe('chat paste image handling', () => {
  let readerOutcomes: ReadonlyMap<string, 'ok' | 'error'>;

  beforeEach(() => {
    readerOutcomes = new Map<string, 'ok' | 'error'>();

    class StubReader {
      public result: string | undefined = undefined;
      private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

      public addEventListener(name: string, listener: (event: unknown) => void): void {
        const listeners = this.listeners.get(name) ?? [];
        listeners.push(listener);
        this.listeners.set(name, listeners);
      }

      // oxlint-disable-next-line no-empty-function -- jsdom FileReader stub satisfies the callback API used by production code.
      public removeEventListener(): void {}

      public readAsDataURL(file: File): void {
        const outcome = readerOutcomes.get(file.name) ?? 'ok';
        queueMicrotask(() => {
          if (outcome === 'error') {
            for (const listener of this.listeners.get('error') ?? []) {
              listener(new Error(`reader-fail-${file.name}`));
            }
            return;
          }

          const result = `data:${file.type};base64,RAW_${file.name}`;
          this.result = result;
          for (const listener of this.listeners.get('load') ?? []) {
            listener({ target: { result } });
          }
        });
      }
    }

    vi.stubGlobal('FileReader', StubReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should collect all image files from clipboard items in order', () => {
    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((name) => makeFile(name));
    const clipboardData = makeClipboardData({
      items: [...files.map((file) => makeItem(file)), makeItem(makeFile('notes.txt', 'text/plain'))],
    });

    expect(getClipboardImageFiles(clipboardData).map((file) => file.name)).toEqual([
      'A.png',
      'B.png',
      'C.png',
      'D.png',
      'E.png',
    ]);
  });

  it('should use clipboard files when the item list exposes fewer image files', () => {
    const itemFile = makeFile('A.png');
    const fileListFiles = ['A.png', 'B.png', 'C.png'].map((name) => makeFile(name));
    const clipboardData = makeClipboardData({ items: [makeItem(itemFile)], files: fileListFiles });

    expect(getClipboardImageFiles(clipboardData).map((file) => file.name)).toEqual(['A.png', 'B.png', 'C.png']);
  });

  it('should dispatch one raw data URL per pasted image in clipboard order', async () => {
    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((name) => makeFile(name));
    const event = {
      clipboardData: makeClipboardData({ items: files.map((file) => makeItem(file)) }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();
    const onReadError = vi.fn<() => void>();

    expect(handleClipboardImagePaste({ event, onImage, onReadError })).toBe(true);

    await waitFor(() => {
      expect(onImage).toHaveBeenCalledTimes(5);
    });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onImage.mock.calls.map(([dataUrl]) => dataUrl)).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_B.png',
      'data:image/png;base64,RAW_C.png',
      'data:image/png;base64,RAW_D.png',
      'data:image/png;base64,RAW_E.png',
    ]);
    expect(onReadError).not.toHaveBeenCalled();
  });

  it('should continue dispatching later pasted images when one image read fails', async () => {
    readerOutcomes = new Map<string, 'ok' | 'error'>([['B.png', 'error']]);
    const files = ['A.png', 'B.png', 'C.png'].map((name) => makeFile(name));
    const event = {
      clipboardData: makeClipboardData({ items: files.map((file) => makeItem(file)) }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();
    const onReadError = vi.fn<() => void>();

    expect(handleClipboardImagePaste({ event, onImage, onReadError })).toBe(true);

    await waitFor(() => {
      expect(onImage).toHaveBeenCalledTimes(2);
    });
    expect(onImage.mock.calls.map(([dataUrl]) => dataUrl)).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_C.png',
    ]);
    expect(onReadError).toHaveBeenCalledOnce();
  });

  it('should attach a pasted JPEG whose declared type is empty, labelled from its bytes', async () => {
    const event = {
      clipboardData: makeClipboardData({ items: [makeItem(makeFile('small.jpg', '', jpegBytes))] }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();

    expect(handleClipboardImagePaste({ event, onImage })).toBe(true);

    await waitFor(() => {
      expect(onImage).toHaveBeenCalledOnce();
    });
    expect(onImage.mock.calls[0]?.[0]).toBe('data:image/jpeg;base64,RAW_small.jpg');
  });

  it('should label a pasted WebP named .jpg as image/webp', async () => {
    const event = {
      clipboardData: makeClipboardData({ items: [makeItem(makeFile('photo.jpg', 'image/jpeg', webpBytes))] }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();

    expect(handleClipboardImagePaste({ event, onImage })).toBe(true);

    await waitFor(() => {
      expect(onImage.mock.calls[0]?.[0]).toBe('data:image/webp;base64,RAW_photo.jpg');
    });
  });

  it('should refuse a pasted file whose bytes are not an image Tau stores or converts', async () => {
    const heic = makeFile('photo.heic', 'image/heic', new TextEncoder().encode('not really an image'));
    const pdf = makeFile('blob', '', pdfLike);
    const event = {
      clipboardData: makeClipboardData({ items: [makeItem(heic), makeItem(pdf)] }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();
    const onRefused = vi.fn<(refusal: AttachmentIntakeRefusal, file: File) => void>();

    expect(handleClipboardImagePaste({ event, onImage, onRefused })).toBe(true);

    await waitFor(() => {
      expect(onRefused).toHaveBeenCalledTimes(2);
    });
    expect(onRefused.mock.calls).toEqual([
      [{ outcome: 'refused', reason: 'not-an-image' }, heic],
      [{ outcome: 'refused', reason: 'not-an-image' }, pdf],
    ]);
    expect(onImage).not.toHaveBeenCalled();
  });

  it('should admit a pasted image the host converts, and refuse it by name when it does not', async () => {
    const bmp = makeFile('scan.bmp', 'image/bmp', bmpBytes);
    const paste = () => ({
      clipboardData: makeClipboardData({ items: [makeItem(bmp)] }),
      preventDefault: vi.fn(),
    });
    const onImage = vi.fn<(dataUrl: string, file: File) => void>();
    const onRefused = vi.fn<(refusal: AttachmentIntakeRefusal, file: File) => void>();

    handleClipboardImagePaste({ event: paste(), onImage, onRefused, loadTranscodeSources: async () => ['bmp'] });
    handleClipboardImagePaste({ event: paste(), onImage, onRefused });

    await waitFor(() => {
      expect(onImage).toHaveBeenCalledWith('data:image/bmp;base64,RAW_scan.bmp', bmp);
      expect(onRefused).toHaveBeenCalledWith({ outcome: 'refused', reason: 'unsupported-format', format: 'bmp' }, bmp);
    });
  });

  it('should read a pasted file typed application/octet-stream and let its bytes decide', async () => {
    const heic = makeFile('IMG_0001.HEIC', 'application/octet-stream', heicBytes);
    const psd = makeFile('layout.psd', 'application/octet-stream', psdBytes);
    const zip = makeFile('models.zip', 'application/octet-stream', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    const event = {
      clipboardData: makeClipboardData({ items: [makeItem(heic), makeItem(psd), makeItem(zip)] }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string, file: File) => void>();
    const onRefused = vi.fn<(refusal: AttachmentIntakeRefusal, file: File) => void>();

    expect(getClipboardImageFiles(event.clipboardData)).toEqual([heic, psd, zip]);
    expect(handleClipboardImagePaste({ event, onImage, onRefused, loadTranscodeSources: async () => ['heic'] })).toBe(
      true,
    );

    await waitFor(() => {
      expect(onRefused).toHaveBeenCalledTimes(2);
    });
    expect(onImage.mock.calls).toEqual([['data:image/heic;base64,RAW_IMG_0001.HEIC', heic]]);
    expect(onRefused.mock.calls).toEqual([
      [{ outcome: 'refused', reason: 'unsupported-format', format: 'psd' }, psd],
      [{ outcome: 'refused', reason: 'not-an-image' }, zip],
    ]);
  });

  it('should leave non-image paste events to the caller fallback', () => {
    const event = {
      clipboardData: makeClipboardData({ items: [makeItem(makeFile('notes.txt', 'text/plain'))] }),
      preventDefault: vi.fn(),
    };
    const onImage = vi.fn<(dataUrl: string) => void>();

    expect(handleClipboardImagePaste({ event, onImage })).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onImage).not.toHaveBeenCalled();
  });
});
