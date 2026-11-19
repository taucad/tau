import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { copyText } from '@taucad/ui/utils/clipboard';

afterEach(() => {
  cleanup();
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
  render(<SlowLinkButton linkDelay={300} />);

  await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

  expect(await screen.findByText('copied')).toBeVisible();
  await expect(navigator.clipboard.readText()).resolves.toBe('https://tau.new/s/after-300ms');
});
