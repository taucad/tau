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
const toastWarningMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@taucad/ui/components/sonner', () => ({
  toast: {
    success: (...args: unknown[]) => {
      toastSuccessMock(...args);
    },
    warning: (...args: unknown[]) => {
      toastWarningMock(...args);
    },
    error: (...args: unknown[]) => {
      toastErrorMock(...args);
    },
  },
}));

/** The JSON body a request sent. */
const bodyOf = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

/** A `POST …/share/access` answer with the given email outcome. */
const inviteAnswer = (email: unknown): Response =>
  Response.json({ id: 'sga_1', recipientEmail: 'x@example.com', email });

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
    toastWarningMock.mockClear();
    toastErrorMock.mockClear();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
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
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
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
    const grant: Pick<PublicationAccessGrant, 'status' | 'createdAt' | 'revokedAt'> = {
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      revokedAt: null,
    };
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
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
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
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

  it('adds normalized email recipients through the cloud link access API', async () => {
    const onGrantsChanged = vi.fn();
    globalThis.fetch = vi.fn<typeof fetch>(async () => inviteAnswer({ status: 'sent' }));
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={onGrantsChanged}
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Invite people by email' });
    expect(field).toHaveAccessibleDescription(
      "We'll email them the link. They sign in with this email address to open it.",
    );
    await userEvent.type(field, 'Friend@Example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_panel/share/access', {
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
    globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) =>
      Response.json({ email: { status: 'sent' } }, { status: bodyOf(init).includes('nope@example.com') ? 500 : 200 }),
    );
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
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

  it('revokes a grant through the cloud link access API', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
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
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_panel/share/access/pva_1', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
    expect(onGrantsChanged).toHaveBeenCalledTimes(1);
    const [message, options] = toastSuccessMock.mock.calls[0] as [string, { action: { label: string } }];
    expect(message).toBe('Removed access for friend@example.com.');
    expect(options.action.label).toBe('Undo');
  });

  it('puts a removed grant back on Undo without a second invite email', async () => {
    const onGrantsChanged = vi.fn();
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
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
      expect(toastSuccessMock).toHaveBeenCalledOnce();
    });
    const [, options] = toastSuccessMock.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenLastCalledWith('https://api.example/v1/projects/proj_panel/share/access', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'friend@example.com', notifyRecipient: false }),
      });
    });
    await waitFor(() => {
      expect(onGrantsChanged).toHaveBeenCalledTimes(2);
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('says so when Undo cannot put the grant back', async () => {
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[
          {
            id: 'pva_1',
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

    await userEvent.click(screen.getByRole('button', { name: /remove access for friend@example.com/i }));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledOnce();
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false } as Response);
    const [, options] = toastSuccessMock.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't give friend@example.com access again. Invite them again.");
    });
  });

  it.each([
    ['not_requested', 'friend@example.com is already invited.'],
    ['skipped', 'Invited friend@example.com.'],
  ])(
    'keeps the grant but offers no link once sharing stopped while the invite ran (%s)',
    async (emailStatus, opening) => {
      globalThis.fetch = vi.fn().mockResolvedValue(inviteAnswer({ status: emailStatus, reason: 'daily_cap' }));
      renderPanel(
        <PublicationAccessPanel
          apiBaseUrl='https://api.example'
          projectId='proj_panel'
          shareUrl='https://tau.example/s/tau~shr_panel'
          visibility='private'
          grants={[]}
          onVisibilityChange={vi.fn()}
          onGrantsChanged={vi.fn(async () => false)}
        />,
      );

      await userEvent.type(
        screen.getByRole('combobox', { name: 'Invite people by email' }),
        'friend@example.com{Enter}',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

      await waitFor(() => {
        expect(toastSuccessMock).toHaveBeenCalledExactlyOnceWith(
          `${opening} Sharing is stopped, so they can open the link once you publish again.`,
        );
      });
      expect(toastWarningMock).not.toHaveBeenCalled();
    },
  );

  it('says an invite email was sent as Invited', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(inviteAnswer({ status: 'sent' }));
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('combobox', { name: 'Invite people by email' }), 'friend@example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Invited friend@example.com.');
    });
    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it.each(['daily_cap', 'limiter_unavailable', 'email_disabled', 'undeliverable', 'send_failed'])(
    'asks the owner to send the link themselves when the email was skipped (%s), without naming why',
    async (reason) => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(inviteAnswer({ status: 'skipped', reason }));
      const onGrantsChanged = vi.fn();
      renderPanel(
        <PublicationAccessPanel
          apiBaseUrl='https://api.example'
          projectId='proj_panel'
          shareUrl='https://tau.example/s/tau~shr_panel'
          visibility='private'
          grants={[]}
          onVisibilityChange={vi.fn()}
          onGrantsChanged={onGrantsChanged}
        />,
      );

      await userEvent.type(
        screen.getByRole('combobox', { name: 'Invite people by email' }),
        'friend@example.com{Enter}',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

      await waitFor(() => {
        expect(toastWarningMock).toHaveBeenCalledOnce();
      });
      const [message, options] = toastWarningMock.mock.calls[0] as [
        string,
        { action: { label: string; onClick: () => void } },
      ];
      expect(message).toBe("We couldn't email friend@example.com. Copy the link and send it yourself.");
      expect(message).not.toMatch(/cap|limit|disabled|undeliverable|bounce|fail/iu);
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(onGrantsChanged).toHaveBeenCalledOnce();
      expect(options.action.label).toBe('Copy link');

      /* The copy starts inside the action's press. */
      options.action.onClick();
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('https://tau.example/s/tau~shr_panel');
      await waitFor(() => {
        expect(toastSuccessMock).toHaveBeenCalledWith('Link copied');
      });
    },
  );

  it('counts the people it could not email apart from those it did', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) =>
      inviteAnswer(bodyOf(init).includes('a@') ? { status: 'sent' } : { status: 'skipped', reason: 'daily_cap' }),
    );
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Invite people by email' }),
      'a@example.com{Enter}b@example.com{Enter}c@example.com{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        "We couldn't email 2 people. Copy the link and send it yourself.",
        expect.anything(),
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Invited a@example.com.');
  });

  it('says an address that already had access has it, with the link to copy, and claims no email', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => inviteAnswer({ status: 'not_requested' }));
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('combobox', { name: 'Invite people by email' }), 'friend@example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledOnce();
    });
    const [message, options] = toastSuccessMock.mock.calls[0] as [string, { action: { label: string } }];
    expect(message).toBe('friend@example.com already has access. Copy the link to send it again.');
    expect(options.action.label).toBe('Copy link');
  });

  it('never claims an email when the answer does not say what happened to it', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => Response.json({ id: 'sga_1' }));
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='private'
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('combobox', { name: 'Invite people by email' }), 'friend@example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        "We couldn't email friend@example.com. Copy the link and send it yourself.",
        expect.anything(),
      );
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('lists five invited people in flow and the rest on request', async () => {
    const grants = Array.from(
      { length: 7 },
      (_unused, index): PublicationAccessGrant => ({
        id: `pva_${String(index)}`,
        recipientEmail: `person${String(index)}@example.com`,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
      }),
    );
    renderPanel(
      <PublicationAccessPanel
        apiBaseUrl='https://api.example'
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
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
        projectId='proj_panel'
        shareUrl='https://tau.example/s/tau~shr_panel'
        visibility='public'
        grants={[
          {
            id: 'pva_1',
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
