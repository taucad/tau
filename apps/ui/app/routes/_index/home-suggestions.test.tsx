// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- analytics wire names. */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatExamples } from '@taucad/ui-core/constants/chat-prompt-examples';
import { resetLeaf } from '@taucad/preferences';

const harness = vi.hoisted(() => ({
  onboarding: true,
  preference: 'auto' as string,
  send: vi.fn(),
  setKernel: vi.fn(),
  setPreference: vi.fn(),
  homeSuggestionSelected: vi.fn(),
}));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => (flag === 'onboarding' ? harness.onboarding : false),
}));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({
    preference: harness.preference,
    setKernel: harness.setKernel,
    setPreference: harness.setPreference,
  }),
}));
vi.mock('#hooks/use-routing-kernel-profile.js', () => ({
  useRoutingKernelProfile: () => ({ available: ['openscad', 'replicad', 'manifold', 'tscircuit', 'picovoxel'] }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ draftActorRef: { send: harness.send } }),
}));
vi.mock('#telemetry/onboarding-telemetry.js', () => ({
  useOnboardingTelemetry: () => ({ homeSuggestionSelected: harness.homeSuggestionSelected }),
}));

const { HomeSuggestions } = await import('#routes/_index/home-suggestions.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');

const states: unknown[] = [];
const renderRow = (): ReturnType<typeof createMemoryRouter> => {
  const router = createMemoryRouter([{ path: '/', element: <HomeSuggestions /> }], { initialEntries: ['/'] });
  router.subscribe((state) => {
    states.push(state.location.state);
  });
  render(<RouterProvider router={router} />);
  return router;
};
const row = (): HTMLElement => screen.getByRole('list', { name: 'Suggestions' });
const shown = (): readonly string[] =>
  within(row())
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
const exampleOf = (prompt: string) => chatExamples.find((example) => example.prompt === prompt)!;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  states.length = 0;
  harness.onboarding = true;
  harness.preference = 'auto';
  personRecordStores.profile.write({ goals: [], languages: [], tool: resetLeaf });
});

describe('Home suggestions', () => {
  it('should show up to four general suggestions with no goals', () => {
    renderRow();

    expect(shown()).toHaveLength(4);
    expect(shown().every((prompt) => exampleOf(prompt).goals.includes('general'))).toBe(true);
  });

  it('should show general suggestions for "Just exploring" alone', () => {
    personRecordStores.profile.write({ goals: ['exploring'] });
    renderRow();

    expect(shown().every((prompt) => exampleOf(prompt).goals.includes('general'))).toBe(true);
  });

  it('should give each stored goal one before any goal has two, and only stored goals', () => {
    personRecordStores.profile.write({ goals: ['mechanical', 'art', 'electronics'] });
    renderRow();
    const goals = shown().map((prompt) => exampleOf(prompt).goals);

    expect(goals).toHaveLength(4);
    expect(goals[0]).toContain('mechanical');
    expect(goals[1]).toContain('art');
    expect(goals[2]).toContain('electronics');
    expect(goals.every((tags) => tags.some((goal) => ['mechanical', 'art', 'electronics'].includes(goal)))).toBe(true);
  });

  it('should keep its order for the page load', () => {
    personRecordStores.profile.write({ goals: ['printing'] });
    renderRow();
    const first = shown();
    cleanup();
    renderRow();

    expect(shown()).toEqual(first);
  });

  it('should leave out a board under a manual pick of a kernel that cannot make one', () => {
    harness.preference = 'openscad';
    personRecordStores.profile.write({ goals: ['electronics'] });
    renderRow();

    expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument();
  });

  it('should be absent with onboarding off', () => {
    harness.onboarding = false;
    renderRow();

    expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument();
  });

  it('should fill the composer and ask it for focus on a click, sending nothing and keeping the kernel', async () => {
    personRecordStores.profile.write({ goals: ['mechanical'] });
    renderRow();
    const [prompt] = shown();
    const example = exampleOf(prompt!);

    await userEvent.click(within(row()).getByRole('button', { name: prompt }));

    expect(harness.send).toHaveBeenCalledExactlyOnceWith({ type: 'setDraftText', text: example.prompt });
    expect(states.at(-1)).toEqual({ focusChatComposer: true });
    expect(harness.setKernel).not.toHaveBeenCalled();
    expect(harness.setPreference).not.toHaveBeenCalled();
  });

  it('should capture the example id and whether it matched a goal, never the prompt', async () => {
    personRecordStores.profile.write({ goals: ['mechanical'] });
    renderRow();
    const [prompt] = shown();

    await userEvent.click(within(row()).getByRole('button', { name: prompt }));

    expect(harness.homeSuggestionSelected).toHaveBeenCalledExactlyOnceWith({
      example_id: exampleOf(prompt!).id,
      goal_matched: true,
    });
    expect(JSON.stringify(harness.homeSuggestionSelected.mock.calls)).not.toContain(prompt);
  });

  it('should capture goal_matched false for a general suggestion', async () => {
    renderRow();
    const [prompt] = shown();

    await userEvent.click(within(row()).getByRole('button', { name: prompt }));

    expect(harness.homeSuggestionSelected).toHaveBeenCalledWith({
      example_id: exampleOf(prompt!).id,
      goal_matched: false,
    });
  });
});
