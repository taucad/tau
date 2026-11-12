/**
 * The product tour's place on a project page, in the main bundle. It holds the anchor registry the editor's controls
 * register with, the live region the tour announces through, and the lazy tour itself, which it loads only while a
 * guided tour is wanted and neither paused nor ended, or while a replay was asked for. Everything else about the tour
 * lives in that chunk, so a page without a tour never requests it.
 */

import { Component, lazy, Suspense, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { DeviceRecord, OnboardingState } from '@taucad/preferences';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import { TourAnchorProvider } from '#components/tour/tour-anchors.js';
import { tourMenuIcons, useTourMenuItem } from '#components/tour/tour-menu.js';
import { tourSession } from '#components/tour/tour-session.js';
import { useFeature } from '#flags/use-feature.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';
import { usePersonRecord } from '#preferences/use-person-record.js';

const TourRuntime = lazy(async () => {
  const module = await import('#components/tour/tour-runtime.js');
  return { default: module.TourRuntime };
});

/**
 * Whether the tour belongs on the page.
 *
 * @param input - The flag, the person and device records, and whether a replay was asked for.
 * @returns Whether to load the tour.
 */
export const shouldLoadTour = (
  input: Readonly<{
    isOnboardingEnabled: boolean;
    onboarding: OnboardingState;
    device: DeviceRecord;
    isReplay: boolean;
  }>,
): boolean => {
  if (!input.isOnboardingEnabled) {
    return false;
  }
  const { tour } = input.onboarding;
  return input.isReplay || (tour.wanted === true && tour.ended === undefined && input.device.tourPaused !== true);
};

/* A tour that fails to load or throws leaves the editor as it is: the tour is never worth losing the page over. */
class TourBoundary extends Component<{ readonly children: ReactNode }, { readonly hasFailed: boolean }> {
  public static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  public override state = { hasFailed: false };

  public override render(): ReactNode {
    return this.state.hasFailed ? null : this.props.children;
  }
}

/* The palette's tour entry on a project page, by the same state as Help's: a replay starts here. */
function TourPaletteItems(): undefined {
  const item = useTourMenuItem(tourSession.requestReplay);
  useCommandPaletteItems(
    'product-tour-menu',
    () => {
      if (item === undefined) {
        return [];
      }
      const Icon = tourMenuIcons[item.kind];
      return [{ id: 'tour-menu', label: item.label, group: 'Help', icon: <Icon />, action: item.run }];
    },
    [item?.kind, item?.label],
  );
  return undefined;
}

/**
 * Wrap the editor with the tour's anchors, its live region and, when it belongs on the page, the tour.
 *
 * @param properties - The editor.
 * @returns The editor and the tour.
 */
export function TourHost({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const isOnboardingEnabled = useFeature('onboarding');
  const { onboarding } = usePersonRecord();
  const { device } = useDeviceRecord();
  const session = useSyncExternalStore(tourSession.subscribe, tourSession.read, tourSession.readInitial);
  const isLoaded = shouldLoadTour({ isOnboardingEnabled, onboarding, device, isReplay: session.isReplay });
  return (
    <TourAnchorProvider>
      {children}
      <TourPaletteItems />
      {isLoaded ? (
        <TourBoundary>
          <Suspense fallback={null}>
            <TourRuntime />
          </Suspense>
        </TourBoundary>
      ) : null}
      <div className='sr-only' role='status' aria-live='polite' data-testid='tour-announcer'>
        {isOnboardingEnabled ? session.announcement : ''}
      </div>
    </TourAnchorProvider>
  );
}
