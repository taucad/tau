/**
 * The shared Copy control, and the one thing it must never do: say "Copied"
 * when nothing was copied.
 *
 * The desktop shell denied `clipboard-sanitized-write`, so every write here
 * rejected with `NotAllowedError` while the button still ticked
 * (`docs/research/desktop-share-links-blueprint.md`, Finding 1). The permission
 * is granted now; these rows are what keeps the report honest when a write
 * fails for any other reason — a revoked permission, an insecure origin, a
 * `getText` that throws.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { CopyButton } from '#components/copy-button.js';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');

/** Install a clipboard whose `writeText` answers however the row needs. */
const stubClipboard = (writeText: ((text: string) => Promise<void>) | undefined): void => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText: vi.fn(writeText) },
  });
};

const renderButton = (getText: () => Promise<string> | string): void => {
  render(
    <TooltipProvider>
      <CopyButton getText={getText} />
    </TooltipProvider>,
  );
};

afterEach(() => {
  if (clipboardDescriptor === undefined) {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- restoring jsdom's own absent property
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  } else {
    Object.defineProperty(globalThis.navigator, 'clipboard', clipboardDescriptor);
  }
});

describe('CopyButton', () => {
  it('should write the text and report the copy when the clipboard accepts it', async () => {
    stubClipboard(async () => undefined);
    renderButton(async () => 'https://tau.new/invitations/tok_abcdef');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDefined();
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('https://tau.new/invitations/tok_abcdef');
  });

  it('should never report a copy when the clipboard write is rejected', async () => {
    stubClipboard(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });
    renderButton(() => 'https://tau.new/invitations/tok_abcdef');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('should announce the failure and name the way out of it', async () => {
    stubClipboard(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });
    renderButton(() => 'https://tau.new/invitations/tok_abcdef');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed. Select the text and copy it.');
  });

  it('should report a failure when the context has no clipboard at all', async () => {
    /* An insecure origin has no `navigator.clipboard`. That used to be a
       `console.warn` behind an `isSecureContext` branch, with the tick shown
       anyway. */
    stubClipboard(undefined);
    renderButton(() => 'plain text');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeDefined();
  });
});
