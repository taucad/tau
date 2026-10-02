import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyPathToClipboard } from '#components/panes/tab-context-menu-actions.js';

const mocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mocks.error } }));

const clipboardDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');

const stubClipboard = (writeText: (text: string) => Promise<void>): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(writeText);
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: spy } });
  return spy;
};

afterEach(() => {
  mocks.error.mockReset();
  if (clipboardDescriptor === undefined) {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- restoring jsdom's own absent property
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  } else {
    Object.defineProperty(globalThis.navigator, 'clipboard', clipboardDescriptor);
  }
});

describe('copyPathToClipboard', () => {
  it('should write the path without reporting an error when the clipboard accepts it', async () => {
    const writeText = stubClipboard(async () => undefined);

    await copyPathToClipboard('src/main.ts');

    expect(writeText).toHaveBeenCalledWith('src/main.ts');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('should resolve and report the refusal when the browser denies clipboard access', async () => {
    const message =
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.';
    stubClipboard(async () => {
      throw new DOMException(message, 'NotAllowedError');
    });

    await expect(copyPathToClipboard('src/main.ts')).resolves.toBeUndefined();

    expect(mocks.error).toHaveBeenCalledWith('Failed to copy path', { description: expect.stringContaining(message) });
  });
});
