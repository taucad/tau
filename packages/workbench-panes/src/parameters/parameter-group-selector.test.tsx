import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParameterManifest } from '@taucad/parameters';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ParameterGroupSelector } from '#parameters/parameter-group-selector.jsx';

// The selector only passes the manifest through to the host's group operations.
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- nothing reads it, so a compiled manifest would be dead weight
const manifest = {} as unknown as ParameterManifest;

const renderSelector = () => {
  const operations = { select: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn() };
  render(
    <TooltipProvider>
      <ParameterGroupSelector
        filePath='main.ts'
        manifest={manifest}
        groups={{ default: { values: {} }, wide: { values: { width: 99 } } }}
        activeGroup='default'
        operations={operations}
        run={(operation) => {
          void operation();
        }}
      />
    </TooltipProvider>,
  );
  return { operations, user: userEvent.setup() };
};

describe('ParameterGroupSelector', () => {
  // Jsdom has no layout; cmdk scrolls the highlighted option into view.
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('names each group action by what it does to which group (I6)', async () => {
    const { user } = renderSelector();

    await user.click(screen.getByRole('button', { name: 'Parameter groups' }));

    expect(await screen.findByRole('button', { name: 'Rename wide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete wide' })).toBeInTheDocument();
  });

  it('shows the row actions on focus and on a coarse pointer, not only on hover (I2)', async () => {
    const { user } = renderSelector();

    await user.click(screen.getByRole('button', { name: 'Parameter groups' }));
    const rename = await screen.findByRole('button', { name: 'Rename wide' });
    const actions = rename.parentElement;

    expect(actions?.className).toContain('pointer-coarse:opacity-100');
    expect(actions?.className).toContain('group-focus-within:opacity-100');
  });

  it('renames a group from its visible Rename action', async () => {
    const { operations, user } = renderSelector();

    await user.click(screen.getByRole('button', { name: 'Parameter groups' }));
    await user.click(await screen.findByRole('button', { name: 'Rename wide' }));
    const field = screen.getByDisplayValue('wide');
    await user.clear(field);
    await user.type(field, 'narrow{Enter}');

    expect(operations.rename).toHaveBeenCalledWith('main.ts', manifest, { group: 'wide', nextGroup: 'narrow' });
  });
});
