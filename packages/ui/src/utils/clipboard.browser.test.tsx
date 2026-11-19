import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { copyText } from '@taucad/ui/utils/clipboard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A share button's shape: the link is still being made when the press ends. */
function SlowLinkButton({ linkDelay }: { /** Milliseconds. */ readonly linkDelay: number }): React.JSX.Element {
  const [outcome, setOutcome] = useState<string>();
  return (
    <>
      <button
        type='button'
        onClick={async () => {
          const link = new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve(`https://tau.new/s/after-${String(linkDelay)}ms`);
            }, linkDelay);
          });
          const { isCopied } = await copyText(link);
          setOutcome(isCopied ? 'copied' : 'refused');
        }}
      >
        Copy link
      </button>
      {outcome === undefined ? null : <output>{outcome}</output>}
    </>
  );
}

it('should copy a link that arrives after the press, through a pending clipboard item', async () => {
  // Pass-through spies: the native clipboard still does the work, the test only sees which path it took.
  const write = vi.spyOn(navigator.clipboard, 'write');
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  render(<SlowLinkButton linkDelay={300} />);

  await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

  // The pending item went in during the press, before the link existed; the late fallback never ran.
  expect(write).toHaveBeenCalledOnce();
  expect(screen.queryByText('copied')).toBeNull();
  expect(await screen.findByText('copied')).toBeVisible();
  expect(writeText).not.toHaveBeenCalled();
  await expect(navigator.clipboard.readText()).resolves.toBe('https://tau.new/s/after-300ms');
});
