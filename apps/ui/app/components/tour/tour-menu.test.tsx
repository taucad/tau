// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@taucad/ui/components/dropdown-menu';

const flags = vi.hoisted(() => ({ onboarding: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: keyof typeof flags) => flags[flag] }));
const telemetry = vi.hoisted(() => ({ tourPaused: vi.fn(), tourResumed: vi.fn() }));
vi.mock('#telemetry/onboarding-telemetry.js', () => ({ useOnboardingTelemetry: () => telemetry }));
const listing = vi.hoisted(() => ({
  projects: [] as Array<{ id: string; lastActivityAt: number; slugs?: { workspaceSlug: string; projectSlug: string } }>,
}));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: listing.projects }) }));

const { TourHelpMenuItem, useTourMenuItem, useTourReplay } = await import('#components/tour/tour-menu.js');
const { tourSession } = await import('#components/tour/tour-session.js');
const { deviceRecordStore, personRecordStores } = await import('#preferences/person-record.store.js');

/** The hook on a page at `path`, with every route answering so a navigation lands. */
const renderMenuItem = (path: string) => {
  let navigatedTo = path;
  const result = renderHook(() => useTourMenuItem(useTourReplay()), {
    wrapper: ({ children }) => {
      const router = createMemoryRouter(
        [
          { path: '/w/:workspace/:project', element: children },
          { path: '*', element: children },
        ],
        { initialEntries: [path] },
      );
      router.subscribe((state) => {
        navigatedTo = state.location.pathname;
      });
      return <RouterProvider router={router} />;
    },
  });
  return { ...result, navigatedTo: () => navigatedTo };
};

beforeEach(() => {
  globalThis.localStorage.clear();
  flags.onboarding = true;
  listing.projects = [];
  telemetry.tourPaused.mockClear();
  telemetry.tourResumed.mockClear();
});

afterEach(() => {
  tourSession.reset();
});

describe('Help’s tour item', () => {
  it('is absent with the flag off', () => {
    flags.onboarding = false;
    expect(renderMenuItem('/w/acme/bracket').result.current).toBeUndefined();
  });

  it('offers Take the tour on a project page, which asks for a replay there', () => {
    const { result } = renderMenuItem('/w/acme/bracket');

    expect(result.current?.label).toBe('Take the tour');
    act(() => {
      result.current?.run();
    });
    expect(tourSession.read().isReplay).toBe(true);
    expect(result.current?.label).toBe('Close tour');

    act(() => {
      result.current?.run();
    });
    expect(tourSession.read().isReplay).toBe(false);
  });

  it('outside a project, opens the most recently active project for the replay', () => {
    listing.projects = [
      { id: 'old', lastActivityAt: 1, slugs: { workspaceSlug: 'acme', projectSlug: 'old' } },
      { id: 'new', lastActivityAt: 5, slugs: { workspaceSlug: 'acme', projectSlug: 'new' } },
      { id: 'unsaved', lastActivityAt: 9 },
    ];
    const { result, navigatedTo } = renderMenuItem('/');

    act(() => {
      result.current?.run();
    });

    expect(navigatedTo()).toBe('/w/acme/new');
    expect(tourSession.read().isReplay).toBe(true);
  });

  it('is absent outside a project when there is none to open', () => {
    expect(renderMenuItem('/').result.current).toBeUndefined();
  });

  it('pauses a running guided tour on this device, and the pause survives a reload', () => {
    personRecordStores.onboarding.write({ wanted: true, seenAdd: ['ask'] });
    const first = renderMenuItem('/');
    expect(first.result.current?.label).toBe('Pause tour');

    act(() => {
      first.result.current?.run();
    });
    expect(telemetry.tourPaused).toHaveBeenCalledWith({ mode: 'guided', step: 'look' });
    expect(tourSession.read().announcement).toBe('Tour paused at tip 2. Resume it from Help.');
    first.unmount();

    /* A reload reads the device record afresh. */
    expect(globalThis.localStorage.length).toBeGreaterThan(0);
    expect(deviceRecordStore.read().tourPaused).toBe(true);
    const second = renderMenuItem('/');
    expect(second.result.current?.label).toBe('Resume tour (tip 2 of 5)');

    act(() => {
      second.result.current?.run();
    });
    expect(deviceRecordStore.read().tourPaused).toBe(false);
    expect(telemetry.tourResumed).toHaveBeenCalledWith({ mode: 'guided', step: 'look' });
    expect(second.result.current?.label).toBe('Pause tour');
  });

  it('offers a replay once the guided tour has ended, without changing what is stored', () => {
    personRecordStores.onboarding.write({ wanted: true, seenAdd: ['ask', 'look'], ended: 'dismissed' });
    const { result } = renderMenuItem('/w/acme/bracket');

    act(() => {
      result.current?.run();
    });

    expect(tourSession.read().isReplay).toBe(true);
    expect(personRecordStores.onboarding.read().tour).toEqual({
      wanted: true,
      seen: ['ask', 'look'],
      ended: 'dismissed',
    });
  });

  it('renders as one menu item in Help', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: (
            <DropdownMenu open>
              <DropdownMenuTrigger>Help</DropdownMenuTrigger>
              <DropdownMenuContent>
                <TourHelpMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        },
      ],
      { initialEntries: ['/w/acme/bracket'] },
    );
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Take the tour' }));
    expect(tourSession.read().isReplay).toBe(true);
  });
});
