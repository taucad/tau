// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopAppNotice } from '#components/desktop/desktop-app-notice.js';
import { SidebarNotices } from '#components/nav/sidebar-notices.js';

const mockState = vi.hoisted(() => ({ isDesktop: false, os: 'macos' as string }));

vi.mock('#lib/build-target.js', () => ({ isDesktopTarget: () => mockState.isDesktop }));
vi.mock('#telemetry/platform-class.js', () => ({ osClass: () => mockState.os }));

const renderStack = (): ReturnType<typeof render> =>
  render(
    <SidebarNotices>
      <DesktopAppNotice />
    </SidebarNotices>,
  );

describe('DesktopAppNotice', () => {
  beforeEach(() => {
    mockState.isDesktop = false;
    mockState.os = 'macos';
    localStorage.clear();
    vi.stubEnv('TAU_DESKTOP_RELEASED', 'true');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('offers the downloads page in a new tab', async () => {
    renderStack();
    // The card is a deferred chunk, loaded once the notice decides to show.
    expect(await screen.findByRole('region', { name: 'Try Tau on desktop' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link).toHaveAttribute('href', '/download');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it.each([
    ['macos', '0 0 384 512'],
    ['windows', '0 0 448 512'],
    ['linux', '0 0 448 512'],
  ])('shows the %s mark in the tile', async (os, viewBox) => {
    mockState.os = os;
    const { container } = renderStack();
    await screen.findByRole('region', { name: 'Try Tau on desktop' });
    expect(container.querySelector('section svg')).toHaveAttribute('viewBox', viewBox);
  });

  it('stays dismissed on this device, across remounts', async () => {
    const { container, unmount } = renderStack();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss desktop app offer' }));
    expect(screen.queryByRole('region', { name: 'Try Tau on desktop' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot=sidebar-notices]')).toBeEmptyDOMElement();
    expect(localStorage.getItem('tau.sidebar-notice.desktop-app.dismissed')).not.toBeNull();
    unmount();
    renderStack();
    expect(screen.queryByRole('region', { name: 'Try Tau on desktop' })).not.toBeInTheDocument();
  });

  it('keeps keyboard focus in the stack after dismissing', async () => {
    render(
      <SidebarNotices>
        <DesktopAppNotice />
        <section>
          <button type='button'>Update ready</button>
        </section>
      </SidebarNotices>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss desktop app offer' }));
    expect(screen.getByRole('button', { name: 'Update ready' })).toHaveFocus();
  });

  it('hides when another tab dismisses it', async () => {
    renderStack();
    await screen.findByRole('region', { name: 'Try Tau on desktop' });
    act(() => {
      localStorage.setItem('tau.sidebar-notice.desktop-app.dismissed', '2026-11-17T00:00:00.000Z');
      globalThis.dispatchEvent(new StorageEvent('storage', { key: 'tau.sidebar-notice.desktop-app.dismissed' }));
    });
    expect(screen.queryByRole('region', { name: 'Try Tau on desktop' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'the desktop build',
      () => {
        mockState.isDesktop = true;
      },
    ],
    [
      'a build without a desktop release',
      () => {
        vi.stubEnv('TAU_DESKTOP_RELEASED', 'false');
      },
    ],
    [
      'a phone',
      () => {
        mockState.os = 'ios';
      },
    ],
    [
      'an unknown OS',
      () => {
        mockState.os = 'other';
      },
    ],
  ])('renders nothing on %s', (_label, arrange) => {
    arrange();
    const { container } = renderStack();
    expect(container.querySelector('[data-slot=sidebar-notices]')).toBeEmptyDOMElement();
  });
});
