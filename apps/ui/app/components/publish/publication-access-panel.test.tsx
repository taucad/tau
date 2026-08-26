// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { PublicationAccessPanel } from '#components/publish/publication-access-panel.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    success: (...args: unknown[]) => {
      toastSuccessMock(...args);
    },
    error: (...args: unknown[]) => {
      toastErrorMock(...args);
    },
  },
}));

describe('PublicationAccessPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    globalThis.ResizeObserver = class ResizeObserver {
      public observe = vi.fn();
      public unobserve = vi.fn();
      public disconnect = vi.fn();
    };
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  const renderPanel = (panel: ReactElement): ReturnType<typeof render> =>
    render(<TooltipProvider>{panel}</TooltipProvider>);

  it('lists active grants and exposes revoke controls', () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        shareUrl='https://tau.example/v/pub_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
            publicationId: 'pub_panel',
            recipientEmail: 'friend@example.com',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt: null,
          },
        ]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke friend@example.com/i })).toBeInTheDocument();
  });

  it('labels revoke controls with a tooltip', async () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        shareUrl='https://tau.example/v/pub_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
            publicationId: 'pub_panel',
            recipientEmail: 'friend@example.com',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt: null,
          },
        ]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    await userEvent.hover(screen.getByRole('button', { name: /revoke friend@example.com/i }));

    expect(await screen.findAllByText('Revoke access')).toHaveLength(2);
  });

  it('adds normalized email recipients through the publication access API', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        shareUrl='https://tau.example/v/pub_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={onGrantsChanged}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: /share with emails/i }), 'Friend@Example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /add access/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_panel/access', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
    });
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
  });

  it('revokes a grant through the publication access API', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        shareUrl='https://tau.example/v/pub_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
            publicationId: 'pub_panel',
            recipientEmail: 'friend@example.com',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt: null,
          },
        ]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={onGrantsChanged}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /revoke friend@example.com/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_panel/access/pva_1', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps people visible but hides recipient entry for public links', () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        shareUrl='https://tau.example/v/pub_panel'
        visibility='public'
        grants={[
          {
            id: 'pva_1',
            publicationId: 'pub_panel',
            recipientEmail: 'friend@example.com',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt: null,
          },
        ]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: /general access/i })).toHaveTextContent('Public');
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /share with emails/i })).not.toBeInTheDocument();
  });
});
