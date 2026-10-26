// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from '@taucad/ui/components/drawer';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PreviewPhoneTopBar } from '#routes/w.$workspace.$project_.preview/preview-phone-top-bar.js';

const settings = vi.hoisted(() => ({ open: false }));

vi.mock('#components/ui/sidebar.js', () => ({
  SidebarTrigger: ({ className }: { readonly className?: string }) => (
    <button type='button' aria-label='Open sidebar' className={className} />
  ),
}));
vi.mock('#routes/w.$workspace.$project_.preview/project-settings-dialog.js', () => ({
  ProjectSettingsDialog: ({ controlled }: { readonly controlled?: { readonly open: boolean } }) => {
    settings.open = controlled?.open ?? false;
    return controlled?.open ? <div role='dialog' aria-label='Project Settings' /> : null;
  },
}));

const renderBar = (onDownloadSource = vi.fn()): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <Drawer>
          <PreviewPhoneTopBar projectName='Bracket' editorUrl='/w/home/bracket' onDownloadSource={onDownloadSource} />
        </Drawer>
      </TooltipProvider>
    </MemoryRouter>,
  );

describe('PreviewPhoneTopBar (HDR-12, D11)', () => {
  it('draws the sidebar, a crumb back to the project, the Preview title, the Workbench and one More menu', () => {
    renderBar();
    const bar = screen.getByRole('banner');
    expect(bar).toHaveClass('h-12');
    const crumb = within(bar).getByRole('link', { name: 'Back to Bracket' });
    expect(crumb).toHaveAttribute('href', '/w/home/bracket');
    expect(crumb).toHaveTextContent('Bracket');
    // The parent crumb names the project, never the page it is on: no self-link.
    expect(within(bar).queryByRole('link', { name: /preview/iu })).toBeNull();
    expect(within(bar).getByRole('heading', { level: 1 })).toHaveTextContent('Bracket Preview');
    // Sidebar, Workbench and More: each a 40px control; Export lives once, in the Workbench (I4).
    const buttons = within(bar).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open sidebar',
      'Workbench',
      'More preview actions',
    ]);
    for (const button of buttons) {
      expect(button).toHaveClass('size-10');
    }
    expect(crumb).toHaveClass('h-10');
    expect(within(bar).queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('keeps Edit, Download source and Project settings in More, with Edit opening the editor', async () => {
    const user = userEvent.setup();
    const onDownloadSource = vi.fn();
    renderBar(onDownloadSource);
    await user.click(screen.getByRole('button', { name: 'More preview actions' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Edit', 'Download source', 'Project settings']);
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('href', '/w/home/bracket');

    await user.click(within(menu).getByRole('menuitem', { name: 'Download source' }));
    expect(onDownloadSource).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'More preview actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Project settings' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Project Settings' })).toBeInTheDocument();
    });
    expect(settings.open).toBe(true);
  });
});
