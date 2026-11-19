import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '#utils/clipboard.js';

const writeText = vi.fn<(text: string) => Promise<void>>();
const write = vi.fn<(items: ClipboardItem[]) => Promise<void>>();

/** A stand-in for the browser's `ClipboardItem`: it keeps what it was given, so a test can read the pending text. */
class FakeClipboardItem {
  declare public readonly items: Record<string, Promise<Blob>>;

  public constructor(items: Record<string, Promise<Blob>>) {
    Object.assign(this, { items });
  }
}

const installClipboard = (options: { withItem: boolean }): void => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: options.withItem ? { writeText, write } : { writeText },
  });
  if (options.withItem) {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('Blob', FakeBlob);
  }
};

/** A stand-in for `Blob` that keeps its parts, because jsdom's Blob cannot be read back synchronously here. */
class FakeBlob {
  declare public readonly parts: readonly string[];

  public constructor(parts: readonly string[]) {
    Object.assign(this, { parts });
  }
}

/** The text inside the first item handed to `write`, once its promise settles. */
const writtenText = async (): Promise<string> => {
  const [item] = write.mock.calls[0]?.[0] ?? [];
  if (!(item instanceof FakeClipboardItem)) {
    throw new TypeError('write was not handed a FakeClipboardItem');
  }
  const blob = await item.items['text/plain'];
  if (!(blob instanceof FakeBlob)) {
    throw new TypeError('the pending item did not settle to a FakeBlob');
  }
  return blob.parts.join('');
};

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  write.mockReset();
  write.mockImplementation(async (items) => {
    const [item] = items;
    if (item instanceof FakeClipboardItem) {
      await item.items['text/plain'];
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('should write known text before it returns to the caller', async () => {
    installClipboard({ withItem: true });

    const copying = copyText('https://tau.new/s/direct');

    expect(writeText).toHaveBeenCalledExactlyOnceWith('https://tau.new/s/direct');
    await expect(copying).resolves.toEqual({ text: 'https://tau.new/s/direct', isCopied: true });
  });

  it('should start the write of pending text inside the call, before the text exists', async () => {
    installClipboard({ withItem: true });
    let finish: (url: string) => void = () => undefined;
    const link = new Promise<string>((resolve) => {
      finish = resolve;
    });

    const copying = copyText(link);

    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
    finish('https://tau.new/s/gist');
    await expect(copying).resolves.toEqual({ text: 'https://tau.new/s/gist', isCopied: true });
    await expect(writtenText()).resolves.toBe('https://tau.new/s/gist');
  });

  it('should write the text once it arrives where a pending item cannot be written', async () => {
    installClipboard({ withItem: false });

    await expect(copyText(Promise.resolve('https://tau.new/s/late'))).resolves.toEqual({
      text: 'https://tau.new/s/late',
      isCopied: true,
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith('https://tau.new/s/late');
  });

  it('should answer the text uncopied when the clipboard refuses both ways', async () => {
    installClipboard({ withItem: true });
    write.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));

    await expect(copyText(Promise.resolve('https://tau.new/s/x'))).resolves.toEqual({
      text: 'https://tau.new/s/x',
      isCopied: false,
    });
    await expect(copyText('https://tau.new/s/y')).resolves.toEqual({ text: 'https://tau.new/s/y', isCopied: false });
  });

  it('should answer uncopied where there is no clipboard at all', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: undefined });

    await expect(copyText('https://tau.new/s/z')).resolves.toEqual({ text: 'https://tau.new/s/z', isCopied: false });
  });

  it('should reject with the work that failed, not report a refused copy', async () => {
    installClipboard({ withItem: true });
    const failure = new Error('Publishing failed');

    await expect(copyText(Promise.reject(failure))).rejects.toBe(failure);
    expect(writeText).not.toHaveBeenCalled();
  });
});
