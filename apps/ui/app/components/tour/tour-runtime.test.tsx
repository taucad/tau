// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

const flags = vi.hoisted(() => ({ onboarding: true, viewerControls: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: keyof typeof flags) => flags[flag] }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
const telemetry = vi.hoisted(() => ({
  tourStarted: vi.fn(),
  tourStepShown: vi.fn(),
  tourStepSeen: vi.fn(),
  tourPaused: vi.fn(),
  tourResumed: vi.fn(),
  tourDismissed: vi.fn(),
  tourCompleted: vi.fn(),
}));
vi.mock('#telemetry/onboarding-telemetry.js', () => ({ useOnboardingTelemetry: () => telemetry }));
const palette = vi.hoisted(() => ({ items: new Map<string, CommandPaletteItem[]>() }));
vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (id: string, factory: () => CommandPaletteItem[]) => {
    palette.items.set(id, factory());
  },
}));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [] }) }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ get: () => undefined, subscribeChat: () => () => undefined }),
}));

/** A stand-in actor whose snapshot never changes. The factory below runs when the tour's chunk first imports it. */
const still = <Snapshot,>(snapshot: Snapshot) => ({
  getSnapshot: () => snapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
});
const runtimeLoads = vi.hoisted(() => ({ count: 0 }));
vi.mock('#hooks/use-project.js', () => {
  runtimeLoads.count += 1;
  const camera = still({ matches: () => true });
  return {
    useProject: () => ({
      projectRef: still({
        context: {
          viewGraphics: new Map([['view', still({ context: { artifact: undefined, cameraRef: camera } })]]),
          geometryUnits: new Map(),
          mainEntryPath: 'main.ts',
        },
      }),
      editorRef: still({ context: { focusedChatId: undefined } }),
    }),
  };
});

const { TourHost, shouldLoadTour } = await import('#components/tour/tour-host.js');
const { tourSession } = await import('#components/tour/tour-session.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');
const { emptyDeviceRecord, emptyOnboardingState } = await import('@taucad/preferences');

const paletteItem = (id: string): CommandPaletteItem | undefined =>
  [...palette.items.values()].flat().find((item) => item.id === id);

function Editor(): React.JSX.Element {
  return <button type='button'>Send</button>;
}

beforeEach(() => {
  globalThis.localStorage.clear();
  flags.onboarding = true;
  palette.items.clear();
  for (const report of Object.values(telemetry)) {
    report.mockClear();
  }
});

afterEach(() => {
  tourSession.reset();
});

describe('shouldLoadTour', () => {
  const base = {
    isOnboardingEnabled: true,
    onboarding: emptyOnboardingState,
    device: emptyDeviceRecord,
    isReplay: false,
  };
  const wanted = { ...emptyOnboardingState, tour: { wanted: true, seen: [] } };

  it('loads the tour only while a guided tour runs or a replay was asked for, behind the flag', () => {
    expect(shouldLoadTour(base)).toBe(false);
    expect(shouldLoadTour({ ...base, onboarding: wanted })).toBe(true);
    expect(shouldLoadTour({ ...base, onboarding: wanted, device: { ...emptyDeviceRecord, tourPaused: true } })).toBe(
      false,
    );
    expect(shouldLoadTour({ ...base, onboarding: { ...wanted, tour: { ...wanted.tour, ended: 'dismissed' } } })).toBe(
      false,
    );
    expect(shouldLoadTour({ ...base, isReplay: true })).toBe(true);
    expect(shouldLoadTour({ ...base, onboarding: wanted, isReplay: true, isOnboardingEnabled: false })).toBe(false);
  });
});

describe('the tour on a project page', () => {
  it('never requests the tour when none is wanted', () => {
    const before = runtimeLoads.count;
    render(
      <TourHost>
        <Editor />
      </TourHost>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(runtimeLoads.count).toBe(before);
    expect(paletteItem('tour-menu')?.label).toBe('Take the tour');
  });

  it('shows a guided tip without taking focus, and moves focus to it and back from the palette', async () => {
    personRecordStores.onboarding.write({ wanted: true });
    render(
      <TourHost>
        <Editor />
      </TourHost>,
    );
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();

    const tip = await screen.findByRole(
      'dialog',
      { name: 'Tour tip 1 of 5: Describe what you want' },
      { timeout: 15_000 },
    );
    expect(send).toHaveFocus();
    expect(tip).not.toHaveAttribute('aria-modal');
    expect(screen.getByTestId('tour-announcer')).toHaveTextContent('Tip 1 of 5: Describe what you want.');

    act(() => {
      paletteItem('tour-focus-tip')?.action?.();
    });
    expect(tip).toHaveFocus();
    await waitFor(() => {
      expect(paletteItem('tour-focus-tip')?.label).toBe('Return from tour tip');
    });

    act(() => {
      paletteItem('tour-focus-tip')?.action?.();
    });
    expect(send).toHaveFocus();
  });

  it('pauses from the tip and leaves the page, keeping the announcement', async () => {
    personRecordStores.onboarding.write({ wanted: true });
    render(
      <TourHost>
        <Editor />
      </TourHost>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Pause tour' }, { timeout: 15_000 }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(telemetry.tourPaused).toHaveBeenCalledWith({ mode: 'guided', step: 'ask' });
    expect(screen.getByTestId('tour-announcer')).toHaveTextContent('Tour paused at tip 1. Resume it from Help.');
    expect(paletteItem('tour-menu')?.label).toBe('Resume tour (tip 1 of 5)');
  });

  it('focuses a replay’s tip and returns focus when it closes, storing nothing', async () => {
    const stored = personRecordStores.onboarding.read();
    render(
      <TourHost>
        <Editor />
      </TourHost>,
    );
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();

    act(() => {
      tourSession.requestReplay();
    });
    const tip = await screen.findByRole(
      'dialog',
      { name: 'Tour tip 1 of 5: Describe what you want' },
      { timeout: 15_000 },
    );
    expect(tip).toHaveFocus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(send).toHaveFocus();
    expect(tourSession.read().isReplay).toBe(false);
    expect(personRecordStores.onboarding.read()).toEqual(stored);
  });
});
