// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostHogConfig } from 'posthog-js';

const received = vi.hoisted(() => ({
  props: undefined as
    | { readonly isActive: boolean; readonly options: Partial<PostHogConfig>; readonly isReplayEnabled: boolean }
    | undefined,
}));

vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_API_HOST: 'https://us.i.posthog.com', POSTHOG_CLIENT_KEY: 'phc_desktop' },
}));
vi.mock('#providers/posthog-analytics-provider.js', () => ({
  PostHogAnalyticsProvider({
    children,
    ...props
  }: {
    readonly isActive: boolean;
    readonly options: Partial<PostHogConfig>;
    readonly isReplayEnabled: boolean;
    readonly children: ReactNode;
  }): ReactNode {
    received.props = props;
    return children;
  },
}));

const { DesktopAnalyticsProvider } = await import('#providers/desktop-analytics-provider.js');

afterEach(() => {
  cleanup();
});

describe('DesktopAnalyticsProvider', () => {
  it('should run analytics without a consent decision, posting to PostHog directly and never starting replay', () => {
    render(
      <DesktopAnalyticsProvider>
        <p>workspace</p>
      </DesktopAnalyticsProvider>,
    );

    expect(screen.getByText('workspace')).toBeTruthy();
    expect(received.props).toMatchObject({
      isActive: true,
      isReplayEnabled: false,
      options: { api_host: 'https://us.i.posthog.com', disable_external_dependency_loading: true },
    });
  });
});
