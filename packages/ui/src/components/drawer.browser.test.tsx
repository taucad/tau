import '#components/select.browser.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FileIcon } from 'lucide-react';
import { DrawerList, drawerRowAttributes } from '#components/drawer.js';

afterEach(() => {
  cleanup();
});

/** The hairline a row draws along its top edge: its left and right insets, or none. */
const divider = (row: Element): { left: string; right: string } | undefined => {
  const before = getComputedStyle(row, '::before');
  if (before.content === 'none' || before.borderTopStyle !== 'solid') {
    return undefined;
  }
  return { left: before.left, right: before.right };
};

const Row = ({ label, hasIcon = false, className }: { label: string; hasIcon?: boolean; className?: string }) => (
  <button
    type='button'
    {...drawerRowAttributes}
    className={`relative flex [--drawer-row-gap:0.75rem] [--drawer-row-icon:1rem] [--drawer-row-inset:1rem] ${className ?? ''}`}
  >
    {hasIcon ? <FileIcon className='size-4' /> : null}
    {label}
  </button>
);

it('should draw a divider above every row after the first, from where its text starts', () => {
  render(
    <DrawerList>
      <Row label='First' />
      <Row label='Plain' />
      <Row label='With icon' hasIcon />
      <Row label='Past indicator' className='[--drawer-row-text-start:2.75rem]' />
    </DrawerList>,
  );

  expect(divider(screen.getByRole('button', { name: 'First' }))).toBeUndefined();
  expect(divider(screen.getByRole('button', { name: 'Plain' }))).toEqual({ left: '16px', right: '16px' });
  expect(divider(screen.getByRole('button', { name: 'With icon' }))).toEqual({ left: '44px', right: '16px' });
  expect(divider(screen.getByRole('button', { name: 'Past indicator' }))).toEqual({ left: '44px', right: '16px' });
});

it('should draw no divider for rows outside a drawer list, as on a desktop menu', () => {
  render(
    <div>
      <Row label='First' />
      <Row label='Second' />
    </div>,
  );

  expect(divider(screen.getByRole('button', { name: 'Second' }))).toBeUndefined();
});
