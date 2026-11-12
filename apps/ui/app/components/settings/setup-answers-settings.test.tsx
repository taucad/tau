// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { resetLeaf } from '@taucad/preferences';

const flags = vi.hoisted(() => ({ onboarding: true }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => (flag === 'onboarding' ? flags.onboarding : false),
}));
const telemetry = vi.hoisted(() => ({ setupAnswersSwitchChanged: vi.fn(), setupAnswersCleared: vi.fn() }));
vi.mock('#telemetry/onboarding-telemetry.js', () => ({ useOnboardingTelemetry: () => telemetry }));

const { AgentSettings } = await import('#components/settings/agent-settings.js');
const { availableSettingsSections, searchSettings } = await import('#components/settings/settings-registry.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');
const { store } = await import('#hooks/use-cookie.js');

const switchKey = `tau-${cookieName.chatCtxPerson}`;

const renderSettings = (): void => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <AgentSettings /> },
      { path: '/welcome', element: <p>Setup</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
};

const answersRow = (): HTMLElement => screen.getByRole('group', { name: 'Setup answers' });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  store.remove(switchKey);
  flags.onboarding = true;
  personRecordStores.profile.write({ goals: [], languages: [], tool: resetLeaf });
});

describe('Settings → Agents setup answers', () => {
  it('should show the switch on by default, with its description', () => {
    renderSettings();

    expect(screen.getByRole('switch', { name: 'Use my setup answers' })).toBeChecked();
    expect(
      screen.getByText(
        'Tau tells the agent what you make and the code you read. This is saved with each chat in the project, where people you share it with can read it. Turning this off does not change chats already saved.',
      ),
    ).toBeInTheDocument();
  });

  it('should store the switch on the device and capture its change', async () => {
    renderSettings();

    await userEvent.click(screen.getByRole('switch', { name: 'Use my setup answers' }));

    expect(screen.getByRole('switch', { name: 'Use my setup answers' })).not.toBeChecked();
    expect(store.get(switchKey)).toBe(false);
    expect(telemetry.setupAnswersSwitchChanged).toHaveBeenCalledWith({ enabled: false });
  });

  it('should show the three answers, each "Not answered" when absent', () => {
    personRecordStores.profile.write({ goals: ['printing', 'electronics'], languages: ['python'] });
    renderSettings();
    const row = within(answersRow());

    expect(row.getByText('3D printing, Electronics')).toBeInTheDocument();
    expect(row.getByText('Python')).toBeInTheDocument();
    expect(row.getByText('Not answered')).toBeInTheDocument();
  });

  it('should open setup from Edit', async () => {
    renderSettings();

    await userEvent.click(within(answersRow()).getByRole('link', { name: 'Edit' }));

    expect(screen.getByText('Setup')).toBeInTheDocument();
  });

  it('should empty the profile on Clear and capture it', async () => {
    personRecordStores.profile.write({ goals: ['art'], tool: 'blender', languages: ['none'] });
    renderSettings();

    await userEvent.click(within(answersRow()).getByRole('button', { name: 'Clear' }));

    expect(personRecordStores.profile.read()).toEqual({ version: 1, goals: [], languages: [] });
    expect(telemetry.setupAnswersCleared).toHaveBeenCalledOnce();
    expect(within(answersRow()).getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('should show neither the switch nor the row with onboarding off', () => {
    flags.onboarding = false;
    renderSettings();

    expect(screen.queryByRole('switch', { name: 'Use my setup answers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Setup answers' })).not.toBeInTheDocument();
  });
});

describe('the registry entries', () => {
  const agentEntries = (isOn: boolean): readonly string[] =>
    availableSettingsSections((flag) => flag === 'onboarding' && isOn)
      .find((section) => section.id === 'agents')
      ?.entries.map((entry) => entry.id) ?? [];

  it('should list both entries only while onboarding is on', () => {
    expect(agentEntries(true)).toEqual(expect.arrayContaining(['use-setup-answers', 'setup-answers']));
    expect(agentEntries(false)).not.toContain('use-setup-answers');
    expect(agentEntries(false)).not.toContain('setup-answers');
  });

  it('should find the switch by search only while onboarding is on', () => {
    const on = availableSettingsSections((flag) => flag === 'onboarding');

    const found = (sections?: typeof on): readonly string[] =>
      searchSettings('setup answers', sections).flatMap(({ entries }) => entries.map((entry) => entry.id));

    expect(found(on)).toContain('use-setup-answers');
    expect(found()).not.toContain('use-setup-answers');
  });
});
