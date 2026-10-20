import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { WorkbenchTab } from '#components/workbench-tab.jsx';
import type { WorkbenchTabProps } from '#components/workbench-tab.jsx';

const renderTab = (props: Partial<WorkbenchTabProps> = {}) =>
  render(
    <TooltipProvider>
      <WorkbenchTab icon={<svg data-testid='icon' />} title='gear.py' {...props} />
    </TooltipProvider>,
  );

describe('WorkbenchTab', () => {
  describe("as: 'button'", () => {
    it('should be a selectable tab that activates on click', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderTab({ isActive: false, onSelect });

      const tab = screen.getByRole('tab', { name: 'gear.py' });
      expect(tab).toHaveAttribute('aria-selected', 'false');
      await user.click(tab);

      expect(onSelect).toHaveBeenCalledOnce();
    });

    it('should close on Delete and Backspace, and advertise the key', () => {
      const onClose = vi.fn();
      renderTab({ onClose });

      const tab = screen.getByRole('tab');
      expect(tab).toHaveAttribute('aria-keyshortcuts', 'Delete');
      fireEvent.keyDown(tab, { key: 'Delete' });
      fireEvent.keyDown(tab, { key: 'Backspace' });

      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('should close from its glyph without selecting the tab or adding a focusable control', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onSelect = vi.fn();
      const { container } = renderTab({ onClose, onSelect });

      const glyph = container.querySelector<HTMLElement>('.fade-action')!;
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await user.click(glyph);

      expect(onClose).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should draw no close glyph for a tab that cannot close', () => {
      const { container } = renderTab();

      expect(container.querySelector('.fade-action')).toBeNull();
      expect(screen.getByRole('tab')).not.toHaveAttribute('aria-keyshortcuts');
    });

    it('should shrink with its siblings to 48 px and dissolve its title instead of clipping', () => {
      const { container } = renderTab({ isActive: true, onClose: vi.fn() });

      const root = container.querySelector('[data-slot="workbench-tab"]');
      expect(root).toHaveClass('fade-row', 'w-36', 'min-w-12', 'shrink', 'bg-accent');
      expect(screen.getByText('gear.py')).toHaveClass(
        'fade-label',
        '[--fade-label-size:var(--fade-label-size-actions)]',
      );
    });

    it('should name the tab by its full title and show it in a tooltip', async () => {
      const user = userEvent.setup();
      renderTab({ fullTitle: 'src/parts/gear.py' });

      const tab = screen.getByRole('tab', { name: 'src/parts/gear.py' });
      await user.hover(tab);

      expect(await screen.findByRole('tooltip')).toHaveTextContent('src/parts/gear.py');
    });
  });

  describe("as: 'div'", () => {
    it('should be content for a tab another element owns, with dockview classes and a native close target', () => {
      const closeRef = createRef<HTMLSpanElement>();
      const { container } = renderTab({
        as: 'div',
        closeRef,
        className: 'dv-default-tab',
        contentClassName: 'dv-default-tab-content',
        titleClassName: 'dockview-tab-title',
        closeClassName: 'dv-default-tab-action',
      });

      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(container.querySelector('button')).toBeNull();
      expect(container.querySelector('[data-slot="workbench-tab"]')).toHaveClass('dv-default-tab', 'fade-row');
      expect(container.querySelector('.dv-default-tab-content')).toContainElement(screen.getByTestId('icon'));
      expect(screen.getByText('gear.py')).toHaveClass('dockview-tab-title');
      expect(closeRef.current).toHaveClass('dv-default-tab-action');
      expect(closeRef.current).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
