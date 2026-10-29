import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { staysInProject, TerminalNavigationGuard } from '#components/terminal/terminal-navigation-guard.js';

const listing = vi.hoisted(() => ({
  projects: [
    {
      id: 'proj_bracket',
      locator: { backend: 'native', relativeDirectory: 'bracket' },
      slugs: { workspaceSlug: 'home', projectSlug: 'bracket' },
    },
    {
      id: 'proj_gear',
      locator: { backend: 'native', relativeDirectory: 'gear' },
      slugs: { workspaceSlug: 'home', projectSlug: 'gear' },
    },
  ],
}));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: listing.projects }) }));

const resolveProject = (workspace: string, project: string): string | undefined =>
  listing.projects.find(
    (candidate) =>
      candidate.slugs.workspaceSlug === workspace &&
      (candidate.slugs.projectSlug === project || candidate.id === project),
  )?.id;

describe('staysInProject', () => {
  const current = { pathname: '/w/home/bracket' };
  it.each([
    ['another chat in the same project (search)', '/w/home/bracket', true],
    ['a trailing slash', '/w/home/bracket/', true],
    ['the slug corrected from the durable id', '/w/home/proj_bracket', true],
    ['the same address in another case', '/w/HOME/Bracket', true],
    ['another project', '/w/home/gear', false],
    ["the project's preview, which unmounts the project", '/w/home/bracket/preview', false],
    ['the project library', '/projects', false],
    ['home', '/', false],
  ])('%s', (_name, pathname, expected) => {
    expect(
      staysInProject({
        currentLocation: current,
        nextLocation: { pathname },
        projectId: 'proj_bracket',
        resolveProject,
      }),
    ).toBe(expected);
  });
});

/** A project route with the guard mounted, as ProjectTerminalPane mounts it while a session runs. */
function ProjectView({ isRunning }: { readonly isRunning: boolean }): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [target, setTarget] = useState('');
  return (
    <>
      <output aria-label='Location'>{`${location.pathname}${location.search}`}</output>
      <input
        aria-label='Go to'
        value={target}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />
      <button
        type='button'
        onClick={() => {
          void navigate(target);
        }}
      >
        Go
      </button>
      {isRunning ? <TerminalNavigationGuard projectId='proj_bracket' projectLabel='bracket' /> : null}
    </>
  );
}

const renderRouter = (isRunning = true) => {
  const router = createMemoryRouter(
    [
      { path: '/w/:workspace/:project', element: <ProjectView isRunning={isRunning} /> },
      { path: '*', element: <ProjectView isRunning={false} /> },
    ],
    { initialEntries: ['/w/home/bracket'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const go = async (path: string): Promise<void> => {
  await userEvent.clear(screen.getByRole('textbox', { name: 'Go to' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Go to' }), path);
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
};
const location = (): string => screen.getByRole('status', { name: 'Location', hidden: true }).textContent;

describe('TerminalNavigationGuard', () => {
  it('never asks about navigation that stays in the project', async () => {
    renderRouter();
    await go('/w/home/bracket?chat=chat_2');
    expect(location()).toBe('/w/home/bracket?chat=chat_2');
    await go('/w/home/proj_bracket');
    expect(location()).toBe('/w/home/proj_bracket');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before leaving for another project; Keep open, by button or Escape, stays', async () => {
    renderRouter();
    await go('/w/home/gear');
    const dialog = screen.getByRole('alertdialog', { name: 'Close the Terminal in bracket?' });
    expect(dialog).toHaveAccessibleDescription('Leaving this project stops its Terminal session.');
    expect(location()).toBe('/w/home/bracket');
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Keep open', 'Close and stop']);
    expect(buttons[0]).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(location()).toBe('/w/home/bracket');

    await go('/projects');
    await userEvent.click(screen.getByRole('button', { name: 'Keep open' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(location()).toBe('/w/home/bracket');
  });

  it('Close and stop lets the navigation through once', async () => {
    renderRouter();
    await go('/w/home/gear');
    await userEvent.click(screen.getByRole('button', { name: 'Close and stop' }));
    expect(location()).toBe('/w/home/gear');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('holds nothing when no session runs', async () => {
    const router = renderRouter(false);
    await go('/w/home/gear');
    expect(location()).toBe('/w/home/gear');
    act(() => {
      void router.navigate(-1);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
