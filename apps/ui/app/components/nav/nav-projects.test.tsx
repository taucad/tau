import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Folder } from 'lucide-react';
import { NavProjects } from '#components/nav/nav-projects.js';
import { SidebarProvider } from '#components/ui/sidebar.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: <T,>(_name: unknown, defaultValue: T) => [defaultValue, vi.fn(), vi.fn()] as const,
}));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => false,
}));

vi.mock('#machines/publish.machine.js', async () => {
  const { publishMachineForUiTests } = await import('#machines/publish.machine.ui-test-double.js');
  return { publishMachine: publishMachineForUiTests };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef: {} }),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'https://api.example' },
}));

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [
      {
        id: 'proj_nav',
        name: 'Nav Demo',
        assets: { mechanical: { main: 'main.ts', parameters: {} } },
      },
    ],
  }),
}));

describe('NavProjects', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        project: { id: 'proj_nav', name: null, description: null },
        currentPublication: null,
        snapshot: { state: 'unpublished' },
      })),
    });
  });

  it('opens the share dialog when Share Project is chosen', async () => {
    render(
      <MemoryRouter>
        <KeyboardProvider>
          <TooltipProvider>
            <SidebarProvider>
              <NavProjects projects={[{ name: 'Nav Demo', url: '/projects/proj_nav', icon: Folder }]} />
            </SidebarProvider>
          </TooltipProvider>
        </KeyboardProvider>
      </MemoryRouter>,
    );

    const moreTriggers = screen.getAllByRole('button', { name: /more/i });
    await userEvent.click(moreTriggers[0]!);

    await userEvent.click(screen.getByTestId('share-project'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nav Demo')).toBeInTheDocument();
  });
});
