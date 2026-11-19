// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { PublicationAccessPanel } from '#components/publish/publication-access-panel.js';
import type { PublicationAccessGrant } from '#components/publish/publication-access-panel.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@taucad/ui/components/sonner', () => ({
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
    expect(screen.getByRole('button', { name: /remove access for friend@example.com/i })).toBeInTheDocument();
  });

  // Email bounce blueprint R9 and D5: "Not delivered", with no reason.
  it('marks a recipient the invite email cannot reach as not delivered', () => {
    const grant: Pick<PublicationAccessGrant, 'publicationId' | 'status' | 'createdAt' | 'revokedAt'> = {
      publicationId: 'pub_panel',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      revokedAt: null,
    };
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        visibility='private'
        grants={[
          {
            ...grant,
            id: 'pva_1',
            recipientEmail: 'friend@example.com',
            notDelivered: false,
          },
          {
            ...grant,
            id: 'pva_2',
            recipientEmail: 'gone@example.com',
            notDelivered: true,
          },
        ]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Email not delivered. Send them the link yourself.')).toHaveLength(1);
    expect(screen.queryByText('Can view')).not.toBeInTheDocument();
    expect(screen.queryByText(/spam|bounced|complain/iu)).not.toBeInTheDocument();
  });

  it('labels revoke controls with a tooltip', async () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
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

    await userEvent.hover(screen.getByRole('button', { name: /remove access for friend@example.com/i }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Remove access');
    expect(screen.getByRole('button', { name: /remove access for friend@example.com/i })).toHaveAccessibleDescription(
      'Remove access',
    );
  });

  it('adds normalized email recipients through the publication access API', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={onGrantsChanged}
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Invite people by email' });
    expect(field).toHaveAccessibleDescription("They'll get an email with the link.");
    await userEvent.type(field, 'Friend@Example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_panel/access', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'friend@example.com', notifyRecipient: true }),
      });
    });
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith('Invited friend@example.com.');
  });

  it('settles each address on its own and keeps only the ones that failed', async () => {
    const onGrantsChanged = vi.fn();
    globalThis.fetch = vi.fn(async (_url: string, init: { readonly body: string }) => ({
      ok: !init.body.includes('nope@example.com'),
    })) as unknown as typeof fetch;
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={onGrantsChanged}
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Invite people by email' });
    await userEvent.type(field, 'a@example.com{Enter}b@example.com{Enter}nope@example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't invite nope@example.com. Try again.");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Invited 2 people.');
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText('nope@example.com')).toBeInTheDocument();
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument();
  });

  it('revokes a grant through the publication access API', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
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

    await userEvent.click(screen.getByRole('button', { name: /remove access for friend@example.com/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_panel/access/pva_1', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith('Removed access for friend@example.com.');
  });

  it('lists five invited people in flow and the rest on request', async () => {
    const grants = Array.from(
      { length: 7 },
      (_unused, index): PublicationAccessGrant => ({
        id: `pva_${String(index)}`,
        publicationId: 'pub_panel',
        recipientEmail: `person${String(index)}@example.com`,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
      }),
    );
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
        visibility='private'
        grants={grants}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 4, name: 'Invited (7)' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Invited' });
    expect(list.className).not.toMatch(/overflow|max-h/u);
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    const more = screen.getByRole('button', { name: 'Show all 7' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);

    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides the invite field and the invited list for a link anyone can open', () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        publicationId='pub_panel'
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

    const setting = screen.getByRole('combobox', { name: /who can open the link/i });
    expect(setting).toHaveTextContent('Anyone with the link');
    expect(setting).toHaveAccessibleDescription('Anyone who has the link can open it.');
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Invite people by email' })).not.toBeInTheDocument();
  });
});
