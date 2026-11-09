// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { Toaster, toast } from '@taucad/ui/components/sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '#hooks/use-cookie.js';
import {
  desktopAnalyticsCopy,
  desktopAnalyticsNoticeStorageName,
  desktopAnalyticsStorageName,
} from '#hooks/use-desktop-analytics.js';
import { DesktopAnalyticsNotice } from '#components/desktop-analytics-notice.js';

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name.
  ENV: { POSTHOG_CLIENT_KEY: 'phc_desktop' },
}));

function Search(): React.JSX.Element {
  return <output aria-label='Search'>{useLocation().search}</output>;
}

const launch = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <DesktopAnalyticsNotice />
      <Search />
      <Toaster />
    </MemoryRouter>,
  );

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  });
};

beforeEach(() => {
  store.remove(desktopAnalyticsStorageName);
  store.remove(desktopAnalyticsNoticeStorageName);
});

afterEach(async () => {
  act(() => {
    toast.dismiss();
  });
  cleanup();
  await settle();
});

describe('DesktopAnalyticsNotice', () => {
  it('should tell the person at first launch that analytics run, where to turn them off, and link the cookies policy', async () => {
    launch();

    expect(await screen.findByText(desktopAnalyticsCopy.noticeTitle)).toBeInTheDocument();
    expect(
      screen.getByText(
        /the desktop app sends usage analytics to help improve tau\. you can turn this off in settings → data controls\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', 'https://tau.new/legal/cookies');
    expect(localStorage.getItem(desktopAnalyticsNoticeStorageName)).toBe('true');
  });

  it('should open Settings → Data controls at the analytics switch from the notice', async () => {
    launch();

    // A click without pointer events: Sonner's swipe handling needs pointer capture, which jsdom lacks.
    fireEvent.click(await screen.findByRole('button', { name: desktopAnalyticsCopy.noticeAction }));

    expect(screen.getByRole('status', { name: 'Search' })).toHaveTextContent(
      '?settings=data-controls&setting=desktop-analytics',
    );
  });

  it('should show the notice only once, on later launches too', async () => {
    const first = launch();
    expect(await screen.findByText(desktopAnalyticsCopy.noticeTitle)).toBeInTheDocument();
    act(() => {
      toast.dismiss();
    });
    first.unmount();
    await settle();

    launch();
    await settle();

    expect(screen.queryByText(desktopAnalyticsCopy.noticeTitle)).not.toBeInTheDocument();
  });

  it('should not claim analytics run once the person has turned them off', async () => {
    localStorage.setItem(desktopAnalyticsStorageName, 'false');

    launch();
    await settle();

    expect(screen.queryByText(desktopAnalyticsCopy.noticeTitle)).not.toBeInTheDocument();
    expect(localStorage.getItem(desktopAnalyticsNoticeStorageName)).toBeNull();
  });
});
