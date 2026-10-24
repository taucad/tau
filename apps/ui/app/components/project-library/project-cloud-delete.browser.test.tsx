import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ProjectActionMenu } from '#components/project-library/project-cloud-delete.js';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';

vi.mock('#hooks/use-cloud-projects.js', () => ({
  useDeleteCloudProject: () => ({ isPending: false, isError: false, data: undefined, mutate: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('cloud deletion confirmation browser acceptance', () => {
  it.each([
    { width: 1280, theme: 'light', isCloudOnly: true },
    { width: 390, theme: 'dark', isCloudOnly: true },
    { width: 1280, theme: 'dark', isCloudOnly: false },
    { width: 390, theme: 'light', isCloudOnly: false },
  ])(
    'should preserve focus and fit at $width in $theme with cloud-only=$isCloudOnly',
    async ({ width, theme, isCloudOnly }) => {
      await page.viewport(width, 844);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      render(
        <div className='p-4'>
          <ProjectActionMenu
            name='Precision bracket'
            cloud={{
              id: 'disposable-browser-fixture',
              name: 'Precision bracket',
              role: 'owner',
              canDeleteCloud: true,
              cloudState: 'active',
            }}
            isCloudOnly={isCloudOnly}
          >
            {isCloudOnly ? null : <DropdownMenuItem>Restore</DropdownMenuItem>}
          </ProjectActionMenu>
        </div>,
      );
      const trigger = screen.getByRole('button', { name: 'Actions for Precision bracket' });
      const bounds = trigger.getBoundingClientRect();
      expect(bounds.width).toBeGreaterThanOrEqual(24);
      expect(bounds.height).toBeGreaterThanOrEqual(24);
      await page.getByRole('button', { name: 'Actions for Precision bracket' }).click();
      await page.getByRole('menuitem', { name: 'Delete from Tau Cloud…' }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Delete “Precision bracket” from Tau Cloud?' });
      await expect.element(dialog).toBeVisible();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
      const content = screen.getByRole('alertdialog').getBoundingClientRect();
      expect(content.left).toBeGreaterThanOrEqual(0);
      expect(content.right).toBeLessThanOrEqual(width);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      await page.screenshot();
      await userEvent.keyboard('{Escape}');
      await expect.element(dialog).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    },
  );
});
