// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { LanguageId } from '@taucad/preferences';

const flags = vi.hoisted(() => ({ onboarding: true, viewerControls: true, partsWarehouse: false }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: keyof typeof flags) => flags[flag],
}));
const kernels = vi.hoisted(() => ({
  host: 'browser' as 'browser' | 'desktop',
  onHost: new Set<LanguageId>(['typescript', 'openscad']),
  onDesktop: new Set<LanguageId>(['typescript', 'openscad', 'python', 'csharp']),
}));
vi.mock('#components/onboarding/setup-kernel-languages.js', () => ({ readKernelLanguages: () => kernels }));

vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');
const { personRecordStores, deviceRecordStore } = await import('#preferences/person-record.store.js');

const renderSetup = (path = '/welcome'): ReturnType<typeof createMemoryRouter> => {
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

const continueButton = (): HTMLElement => screen.getByRole('button', { name: 'Continue' });

describe('setup', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    flags.onboarding = true;
    flags.viewerControls = true;
    flags.partsWarehouse = false;
    kernels.host = 'browser';
  });

  it('shows four steps with viewerControls on and three with it off', () => {
    renderSetup();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
  });

  it('leaves the viewer step out while viewerControls is off', async () => {
    flags.viewerControls = false;
    const user = userEvent.setup();
    renderSetup();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    await user.click(continueButton());
    await user.click(continueButton());
    expect(screen.getByRole('heading', { level: 1, name: 'Design, verify, build' })).toBeInTheDocument();
  });

  it('redirects home with onboarding off', async () => {
    flags.onboarding = false;
    renderSetup();
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('has Skip in the header of every step; it records skipped and goes home', async () => {
    const user = userEvent.setup();
    const router = renderSetup();
    const skipInHeader = (): HTMLElement =>
      within(screen.getByRole('banner')).getByRole('button', { name: 'Skip setup' });
    expect(skipInHeader()).toBeInTheDocument();
    await user.click(continueButton());
    expect(skipInHeader()).toBeInTheDocument();
    await user.click(continueButton());
    expect(skipInHeader()).toBeInTheDocument();
    await user.click(continueButton());
    expect(skipInHeader()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(personRecordStores.onboarding.read().setup?.status).toBe('skipped');
  });

  it('continues with nothing chosen on every step, and Back keeps every answer', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('checkbox', { name: /Mechanical parts/ }));
    await user.click(continueButton());
    await user.click(screen.getByRole('radio', { name: 'SolidWorks' }));
    await user.click(continueButton());
    await user.click(continueButton());
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: 'SolidWorks' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('checkbox', { name: /Mechanical parts/ })).toBeChecked();
  });

  it('moves focus to the new step heading after a step change', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(continueButton());
    expect(screen.getByRole('heading', { level: 1, name: 'Where are you coming from?' })).toHaveFocus();
  });

  it('opens at step 4 from How Tau works', () => {
    renderSetup('/welcome?step=how');
    expect(screen.getByRole('heading', { level: 1, name: 'Design, verify, build' })).toBeInTheDocument();
  });

  it('keeps "Just exploring" exclusive and stores the checked set', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('checkbox', { name: /3D printing/ }));
    await user.click(screen.getByRole('checkbox', { name: /Electronics/ }));
    expect(personRecordStores.profile.read().goals).toEqual(['printing', 'electronics']);
    await user.click(screen.getByRole('checkbox', { name: /Just exploring/ }));
    expect(personRecordStores.profile.read().goals).toEqual(['exploring']);
    expect(screen.getByRole('checkbox', { name: /3D printing/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Hardware products/ }));
    expect(personRecordStores.profile.read().goals).toEqual(['product']);
    expect(screen.getByRole('checkbox', { name: /Just exploring/ })).not.toBeChecked();
  });

  it('updates the Agent and Home rows at once and announces only the rows that changed', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('checkbox', { name: /3D printing/ }));
    expect(screen.getByTestId('setup-answers-row-agent')).toHaveTextContent(
      'Knows what you make (3d printing) when it picks a kernel',
    );
    expect(screen.getByTestId('setup-answers-row-home')).toHaveTextContent(
      'Suggests “A wall hook that holds 5 kg and prints without supports”',
    );
    const announcement = screen.getByTestId('setup-answers-announcement');
    expect(announcement).toHaveAttribute('role', 'status');
    expect(announcement.textContent).toContain('Agent:');
    expect(announcement.textContent).toContain('Home:');
    expect(announcement.textContent).not.toContain('Viewer:');
    await user.click(screen.getByRole('checkbox', { name: /Electronics/ }));
    expect(announcement.textContent).toContain('Agent:');
    expect(announcement.textContent).not.toContain('Home:');
  });

  it('shows the storage sentence under the rows and the device line on step 1 on both hosts', () => {
    renderSetup();
    expect(screen.getByTestId('setup-answers-panel')).toHaveTextContent(
      'What the agent is told is saved with your chats in the project',
    );
    expect(screen.getByTestId('setup-storage-status')).toHaveTextContent('Your choices are saved on this device.');
  });

  it('lists twelve tools and five languages with "I\'d rather not write code" exclusive', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(continueButton());
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    const group = screen.getByRole('group', { name: 'Do you write code?' });
    expect(within(group).getAllByRole('button')).toHaveLength(5);
    await user.click(within(group).getByRole('button', { name: 'Python' }));
    await user.click(within(group).getByRole('button', { name: 'C#' }));
    expect(personRecordStores.profile.read().languages).toEqual(['python', 'csharp']);
    await user.click(within(group).getByRole('button', { name: "I'd rather not write code" }));
    expect(personRecordStores.profile.read().languages).toEqual(['none']);
    await user.click(within(group).getByRole('button', { name: 'OpenSCAD' }));
    expect(personRecordStores.profile.read().languages).toEqual(['openscad']);
  });

  it("changes the Viewer row to the tool's suggestion unless a preset was chosen", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(continueButton());
    await user.click(screen.getByRole('radio', { name: 'Blender' }));
    expect(personRecordStores.profile.read().tool).toBe('blender');
    expect(screen.getByTestId('setup-answers-row-viewer')).toHaveTextContent(
      'Middle-drag orbit, Shift pan, axis balls gizmo',
    );
    personRecordStores.viewer.write({ controls: { preset: 'tau' } });
    await user.click(screen.getByRole('radio', { name: 'SolidWorks' }));
    expect(screen.getByTestId('setup-answers-row-viewer')).toHaveTextContent('Tau default, cube gizmo');
  });

  it('shows the host line for a language with no kernel in the browser, and none on the desktop', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(continueButton());
    await user.click(screen.getByRole('button', { name: 'Python' }));
    expect(screen.getByTestId('setup-answers-row-agent')).toHaveTextContent(
      'No Python kernel is available in the browser yet. The desktop app has one.',
    );
    await user.click(screen.getByRole('button', { name: 'Python' }));
    await user.click(screen.getByRole('button', { name: 'TypeScript or JavaScript' }));
    expect(screen.getByTestId('setup-answers-row-agent')).not.toHaveTextContent('kernel is available');
  });

  it('shows no host line on the desktop for a language the desktop set has a kernel for', async () => {
    kernels.host = 'desktop';
    const saved = kernels.onHost;
    kernels.onHost = kernels.onDesktop;
    const user = userEvent.setup();
    renderSetup();
    await user.click(continueButton());
    await user.click(screen.getByRole('button', { name: 'Python' }));
    expect(screen.getByTestId('setup-answers-row-agent')).not.toHaveTextContent('kernel is available');
    kernels.onHost = saved;
  });

  it('shows stored answers on re-entry', () => {
    personRecordStores.profile.write({ goals: ['art'], tool: 'blender', languages: ['python'] });
    deviceRecordStore.write({ inputDevice: 'trackpad' });
    renderSetup();
    expect(screen.getByRole('checkbox', { name: /3D art and game props/ })).toBeChecked();
  });
});
