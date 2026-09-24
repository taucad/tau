/* @vitest-environment jsdom */
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: (): boolean => false }));

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const Picker = ({ name, onClose }: { readonly name: string; readonly onClose: () => void }): React.JSX.Element => (
  <ComboBoxResponsive
    title={`Select ${name}`}
    description={`Select a ${name}.`}
    groupedItems={[{ name, items: [`${name} option`] }]}
    getValue={(item) => item}
    renderLabel={(item) => item}
    isSearchEnabled={false}
    onClose={onClose}
  >
    <button type='button'>{name}</button>
  </ComboBoxResponsive>
);

describe('ComboBoxResponsive desktop popovers', () => {
  it('should switch between sibling pickers with one click', async () => {
    const user = userEvent.setup();

    function Composer(): React.JSX.Element {
      const editorReference = useRef<HTMLInputElement>(null);
      const focusEditor = (): void => {
        requestAnimationFrame(() => editorReference.current?.focus());
      };

      return (
        <>
          <input ref={editorReference} aria-label='Composer' />
          <Picker name='Model' onClose={focusEditor} />
          <Picker name='Location' onClose={focusEditor} />
        </>
      );
    }

    render(<Composer />);

    await user.click(screen.getByRole('button', { name: 'Model' }));
    expect(screen.getByRole('option', { name: 'Model option' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Location' }));

    expect(screen.queryByRole('option', { name: 'Model option' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Location option' })).toBeVisible();
  });

  it('hands focus to onClose after Escape, not back to its trigger', async () => {
    const user = userEvent.setup();

    function Composer(): React.JSX.Element {
      const editorReference = useRef<HTMLInputElement>(null);
      return (
        <>
          <input ref={editorReference} aria-label='Composer' />
          <Picker name='Location' onClose={() => editorReference.current?.focus()} />
        </>
      );
    }

    render(<Composer />);
    await user.click(screen.getByRole('button', { name: 'Location' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('option', { name: 'Location option' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Composer' })).toHaveFocus();
  });
});
