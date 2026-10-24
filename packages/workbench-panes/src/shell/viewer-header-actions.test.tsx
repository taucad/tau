import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ViewerHeaderActions } from '#shell/viewer-header-actions.jsx';
import type { ViewerHeaderActionsProps } from '#shell/viewer-header-actions.jsx';

const renderActions = (props: Partial<ViewerHeaderActionsProps> = {}) => {
  const onOpenPane = vi.fn();
  render(
    <TooltipProvider>
      <ViewerHeaderActions onOpenPane={onOpenPane} {...props} />
    </TooltipProvider>,
  );
  return { onOpenPane, group: screen.getByRole('group', { name: 'Workbench actions' }) };
};

describe('ViewerHeaderActions', () => {
  it('should open the Share and Export panes', async () => {
    const user = userEvent.setup();
    const { onOpenPane } = renderActions();

    await user.click(screen.getByRole('button', { name: 'Share' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(onOpenPane.mock.calls).toEqual([['share'], ['export']]);
  });

  it('should fold both labels to their icons below the one viewer breakpoint', () => {
    renderActions();

    for (const name of ['Share', 'Export']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('@max-xl/viewer:w-7', '@max-xl/viewer:px-0');
      expect(button.querySelector('span')).toHaveClass('hidden', '@xl/viewer:inline');
    }
  });

  it('should keep both actions visible but unavailable while disabled', () => {
    renderActions({ isDisabled: true });

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('should put the leading content first and the trailing content last after a hairline', () => {
    const { group } = renderActions({
      leading: <button type='button'>Revisions</button>,
      trailing: <button type='button'>Toggle workbench</button>,
    });

    const names = [...group.querySelectorAll('button')].map((button) => button.textContent);
    expect(names).toEqual(['Revisions', 'Share', 'Export', 'Toggle workbench']);
    expect(group.querySelector('[data-orientation="vertical"]')).not.toBeNull();
  });

  it('should draw no hairline without trailing content', () => {
    const { group } = renderActions();

    expect(group.querySelector('[data-orientation="vertical"]')).toBeNull();
  });

  it('should hand the Share button to the host ref', () => {
    const shareRef = createRef<HTMLButtonElement>();
    renderActions({ shareRef });

    expect(shareRef.current).toBe(screen.getByRole('button', { name: 'Share' }));
  });
});
