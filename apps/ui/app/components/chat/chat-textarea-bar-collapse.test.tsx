import { act, render } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useBarCollapse } from '#components/chat/chat-textarea-desktop.js';

type Setters = { setMeter?: (value: string) => void; setLevel?: (value: string) => void };

function Bar({ setters }: { readonly setters: Setters }): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  const [meter, setMeter] = useState('10%');
  const [level, setLevel] = useState('High');
  setters.setMeter = setMeter;
  setters.setLevel = setLevel;
  useBarCollapse(barRef);
  return (
    <div ref={barRef}>
      <span data-slot='trigger-model'>Opus</span>
      <span className='group-data-[hide-level]/bar:hidden'>{level}</span>
      <span data-slot='context-meter'>{meter}</span>
    </div>
  );
}

/** Counts layout reads of the name, which is what the collapse pays a forced layout for. */
const countNameReads = (): { readonly count: () => number } => {
  let reads = 0;
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.dataset['slot'] === 'trigger-model') {
        reads += 1;
      }
      return (descriptor?.get?.call(this) as number | undefined) ?? 0;
    },
  });
  return { count: () => reads };
};

describe('useBarCollapse', () => {
  it('should measure only when the name or a label that leaves changes, not on every change under the bar', async () => {
    const reads = countNameReads();
    const setters: Setters = {};
    render(<Bar setters={setters} />);
    const afterMount = reads.count();
    expect(afterMount).toBeGreaterThan(0);

    await act(async () => {
      setters.setMeter?.('11%');
    });
    await act(async () => {
      setters.setMeter?.('12%');
    });
    expect(reads.count()).toBe(afterMount);

    await act(async () => {
      setters.setLevel?.('Medium');
    });
    expect(reads.count()).toBeGreaterThan(afterMount);
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- restore the prototype's own accessor
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  });
});
