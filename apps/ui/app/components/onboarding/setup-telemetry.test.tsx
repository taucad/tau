// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- analytics wire names. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => true }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));
const capture = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
/* "Take it again" reads the project listing; these suites have no project. */
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [] }) }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');

const renderSetup = (path: string): void => {
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <WelcomeRoute /> },
      { path: '/', element: <p>Home</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
};

const events = (name: string): unknown[] =>
  (capture.mock.calls as Array<[string, unknown]>)
    .filter(([event]) => event === name)
    .map(([, properties]) => properties);

describe('setup telemetry', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    capture.mockReset();
  });

  it('captures setup opened once with its entry and host', () => {
    renderSetup('/welcome?entry=palette');
    expect(events('onboarding_setup_opened')).toEqual([{ entry: 'palette', host: 'web' }]);
  });

  it('counts an address with no entry as Help', () => {
    renderSetup('/welcome');
    expect(events('onboarding_setup_opened')).toEqual([{ entry: 'help', host: 'web' }]);
  });

  it('captures each step, the viewer choices and completion with exactly their properties', async () => {
    const user = userEvent.setup();
    renderSetup('/welcome?entry=signup');
    await user.click(screen.getByRole('checkbox', { name: /3D printing/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Mouse controls' })).getByRole('radio', { name: /Right-drag orbit/ }),
    );
    await user.click(screen.getByRole('radio', { name: 'Axes' }));
    await user.click(screen.getByRole('radio', { name: 'None' }));
    await user.click(screen.getByRole('switch', { name: /trackpad/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(events('onboarding_step_completed')).toEqual([
      { step: 'goals', answered: true },
      { step: 'background', answered: false },
      { step: 'viewer', answered: true },
      { step: 'how', answered: true },
    ]);
    expect(events('viewer_preset_selected')).toEqual([{ preset: 'right-orbit', suggested: false, source: 'setup' }]);
    expect(events('viewer_gizmo_selected')).toEqual([{ style: 'axes', suggested: false, source: 'setup' }]);
    expect(events('viewer_default_changed')).toEqual([{ level: 'person', field: 'display.gizmo' }]);
    expect(events('$set')).toEqual(
      expect.arrayContaining([
        { $set: { mouse_preset: 'right-orbit' } },
        { $set: { gizmo_style: 'axes' } },
        { $set: { input_device: 'trackpad' } },
      ]),
    );
    const [completed] = events('onboarding_setup_completed') as Array<Record<string, unknown>>;
    expect(Object.keys(completed ?? {}).toSorted()).toEqual(['duration_ms', 'steps_answered', 'tour_wanted']);
    expect(completed).toEqual(expect.objectContaining({ steps_answered: 2, tour_wanted: true }));
    expect(completed?.['duration_ms']).toEqual(expect.any(Number));
  });

  it('captures a skip with the step it happened on', async () => {
    const user = userEvent.setup();
    renderSetup('/welcome?entry=invite');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(events('onboarding_setup_skipped')).toEqual([{ at_step: 'background' }]);
  });

  it('sets goals, tool and setup status as person properties when they change', async () => {
    const user = userEvent.setup();
    renderSetup('/welcome?entry=help');
    await user.click(screen.getByRole('checkbox', { name: /Electronics/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: 'KiCad or another ECAD tool' }));
    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(events('$set')).toEqual([
      { $set: { setup_status: 'offered' } },
      { $set: { goals: ['electronics'] } },
      { $set: { goals: ['electronics'], tool: 'kicad' } },
      { $set: { setup_status: 'skipped' } },
    ]);
  });

  it('sets the stored setup status, so reopening setup after Finish or skipping it then keeps completed', async () => {
    const user = userEvent.setup();
    personRecordStores.onboarding.write({ setupStatus: 'completed' });
    renderSetup('/welcome?entry=help');
    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(events('$set')).toEqual([{ $set: { setup_status: 'completed' } }, { $set: { setup_status: 'completed' } }]);
  });

  it('sends no free text: every property is a closed value, a number or a boolean', async () => {
    const user = userEvent.setup();
    renderSetup('/welcome?entry=signup');
    await user.click(screen.getByRole('checkbox', { name: /Mechanical parts/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: 'SolidWorks' }));
    const sent = JSON.stringify(capture.mock.calls);
    expect(sent).not.toContain('Mechanical parts');
    expect(sent).not.toContain('SolidWorks');
  });
});
