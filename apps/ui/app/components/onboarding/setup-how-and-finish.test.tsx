// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

const flags = vi.hoisted(() => ({ onboarding: true, viewerControls: true, partsWarehouse: false }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: keyof typeof flags) => flags[flag] }));
const host = vi.hoisted(() => ({ isDesktop: false }));
vi.mock('#lib/build-target.js', () => ({ isDesktopTarget: () => host.isDesktop }));
const connectWorkspace = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace }) }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');

const renderSetup = (path = '/welcome?step=how'): ReturnType<typeof createMemoryRouter> => {
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <WelcomeRoute /> },
      { path: '/', element: <p>Home</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('setup step 4 and Finish', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    flags.viewerControls = true;
    flags.partsWarehouse = false;
    host.isDesktop = false;
    connectWorkspace.mockReset();
  });

  it("shows Design, Verify and Build cards in that order with the marketing site's copy", () => {
    renderSetup();
    const steps = [...screen.getByTestId('design-verify-build').querySelectorAll('article')].map(
      (card) => card.dataset['testid'],
    );
    expect(steps).toEqual(['concept-design', 'concept-verify', 'concept-build']);
    expect(screen.getByTestId('concept-design')).toHaveTextContent(
      'picks the kernel from your prompt and tells you why',
    );
    expect(screen.getByTestId('concept-build')).toHaveTextContent(
      'Export STEP for machining, or STL and 3MF for 3D printing.',
    );
    expect(screen.getByTestId('concept-kernels')).toHaveTextContent('the engine that turns code into geometry');
    expect(screen.queryByTestId('concept-desktop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('concept-warehouse')).not.toBeInTheDocument();
  });

  it('says Auto uses what you make once a goal is chosen', () => {
    personRecordStores.profile.write({ goals: ['electronics'] });
    renderSetup();
    expect(screen.getByTestId('concept-design')).toHaveTextContent(
      'picks the kernel from your prompt and what you make, and tells you why',
    );
    expect(screen.getByTestId('concept-kernels')).toHaveTextContent('board.circuit.tsx');
  });

  it('shows the desktop card only on the desktop and the warehouse card only with partsWarehouse', () => {
    host.isDesktop = true;
    flags.partsWarehouse = true;
    renderSetup();
    expect(screen.getByTestId('concept-desktop')).toHaveTextContent('Runs on your machine');
    expect(screen.getByTestId('concept-warehouse')).toHaveTextContent('Start from real parts');
  });

  it('has the tour switch on by default and Finish stores it in tour.wanted', async () => {
    const user = userEvent.setup();
    renderSetup();
    const tourSwitch = screen.getByRole('switch', { name: 'Show me around the next project I open' });
    expect(tourSwitch).toBeChecked();
    await user.click(tourSwitch);
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(personRecordStores.onboarding.read().tour.wanted).toBe(false);
  });

  it('replaces the switch with "You have taken the tour" once the tour has ended', () => {
    personRecordStores.onboarding.write({ ended: 'completed' });
    renderSetup();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('You have taken the tour')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take it again' })).toBeInTheDocument();
  });

  it('says the tour was taken in the summary once it has ended, not that tips will appear', async () => {
    personRecordStores.onboarding.write({ ended: 'dismissed' });
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const summary = screen.getByTestId('setup-summary');
    expect(summary).toHaveTextContent('You have taken the tour');
    expect(summary).not.toHaveTextContent('Tips will appear');
  });

  it('stores completed and shows a three-line summary with Start building', async () => {
    personRecordStores.profile.write({ goals: ['mechanical'], tool: 'solidworks' });
    const user = userEvent.setup();
    const router = renderSetup();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(personRecordStores.onboarding.read().setup?.status).toBe('completed');
    const summary = screen.getByTestId('setup-summary');
    expect(summary.querySelectorAll('li')).toHaveLength(3);
    expect(summary).toHaveTextContent('You make: mechanical parts');
    expect(summary).toHaveTextContent('Viewer: Middle-drag orbit, Ctrl pan, cube gizmo');
    expect(summary).toHaveTextContent('Tips will appear in the next project you open');
    expect(screen.getByRole('heading', { level: 1, name: 'You’re set' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Open a folder' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start building' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('has two summary lines and no Viewer settings link with viewerControls off', async () => {
    flags.viewerControls = false;
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByTestId('setup-summary').querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Open Viewer settings' })).not.toBeInTheDocument();
  });

  it('offers Open a folder on the desktop', async () => {
    host.isDesktop = true;
    connectWorkspace.mockResolvedValue({ workspace: { workspaceId: 'w', name: 'Parts' }, minted: false });
    const user = userEvent.setup();
    const router = renderSetup();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await user.click(screen.getByRole('button', { name: 'Open a folder' }));
    expect(connectWorkspace).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows every stored answer on re-entry, and a change is stored at once', async () => {
    personRecordStores.profile.write({ goals: ['printing'], tool: 'slicer', languages: ['none'] });
    personRecordStores.onboarding.write({ setupStatus: 'completed' });
    const user = userEvent.setup();
    renderSetup('/welcome');
    expect(screen.getByRole('checkbox', { name: /3D printing/ })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Electronics/ }));
    expect(personRecordStores.profile.read().goals).toEqual(['printing', 'electronics']);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('radio', { name: 'A slicer (Bambu Studio, PrusaSlicer, Cura)' })).toBeChecked();
    expect(screen.getByRole('button', { name: "I'd rather not write code" })).toHaveAttribute('aria-pressed', 'true');
  });
});
