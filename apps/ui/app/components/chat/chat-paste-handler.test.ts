import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClipboardImageFiles, handleClipboardImagePaste } from '#components/chat/chat-paste-handler.js';

const makeFile = (name: string, type = 'image/png'): File => new File([new Blob(['stub'])], name, { type });

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
