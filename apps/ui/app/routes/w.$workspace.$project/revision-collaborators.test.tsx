/**
 * Collaborators, in the Share panel (C4, Q5; charter W5, D27).
 *
 * The owner alone manages this surface. The API emails the invitation and
 * says whether it did (`emailDelivery`); the one-time link it answers with is
 * shown either way, and when the email was not sent it is the only way the
 * invitation reaches anybody.
 *
 * The desktop document origin is `app://tau`, a scheme only this app can open,
 * so an invitation built from `location.origin` was unusable by the one person
 * it was for (`docs/research/desktop-share-links-blueprint.md`, L1); the first
 * rows are that host difference.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { RemoteFacet } from '@taucad/revisions';
import {
  ProjectPeopleWithAccess,
  RevisionCollaborators,
} from '#routes/w.$workspace.$project/revision-collaborators.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';

type Viewer = { role: ProjectAccessRole | undefined; remote: Pick<RemoteFacet, 'kind' | 'phase'> };

const viewer = vi.hoisted((): Viewer => ({ role: 'owner', remote: { kind: 'tau', phase: 'connected' } }));

vi.mock('#hooks/use-revision-status.js', () => ({
  useProjectRole: () => viewer.role,
  useRevisionStatus: () => ({ remote: viewer.remote }),
}));

const clientEnvironment = globalThis.window.ENV;

type Rows = readonly unknown[];

const answer = (
  rows: Rows = [],
  invite?: { status: number; body: unknown },
  listing?: { status: number },
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return { ok: true, status: 200, json: async () => ({ email: 'teammate@example.test', role: 'read' }) };
    }
    if (init?.method === 'POST') {
      const reply = invite ?? {
        status: 201,
        body: {
          email: 'teammate@example.test',
          role: 'write',
          token: 'tok_abcdef',
          expiresAt: '2026-10-02T00:00:00.000Z',
          emailDelivery: { status: 'skipped', reason: 'email_disabled' },
        },
      };
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
    }
    if (init?.method === 'DELETE') {
      return { ok: true, status: 204, json: async () => ({}) };
    }
    const status = listing?.status ?? 200;
    return { ok: status < 400, status, json: async () => rows };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderPanel = (element: React.JSX.Element = <RevisionCollaborators projectId='proj_1' />): void => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>{element}</TooltipProvider>
    </QueryClientProvider>,
  );
};

const issueInvitation = async (): Promise<HTMLInputElement> => {
  renderPanel();

  await userEvent.type(await screen.findByRole('textbox', { name: 'Email address' }), 'teammate@example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

  return screen.findByRole('textbox', { name: 'Invite link for teammate@example.test' });
};

const teammate = {
  email: 'teammate@example.test',
  role: 'write',
  status: 'accepted',
  expiresAt: '2026-10-02T00:00:00.000Z',
};

beforeEach(() => {
  answer();
  viewer.role = 'owner';
  viewer.remote = { kind: 'tau', phase: 'connected' };
  globalThis.window.ENV = {
    ...clientEnvironment,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- local host fixture
    TAU_API_URL: 'http://localhost:4000',
  };
  /* Radix's Select asks for pointer capture before it opens, and jsdom has
     none — the same shims the backup-line suite installs. */
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  globalThis.window.ENV = clientEnvironment;
});

describe('RevisionCollaborators', () => {
  it('should mint the invitation from the document origin on the web', async () => {
    const link = await issueInvitation();

    expect(link.value).toBe(`${globalThis.location.origin}/invitations/tok_abcdef`);
    expect(screen.getByRole('status', { name: 'Invite link created' }).classList.contains('ph-no-capture')).toBe(true);
    expect(screen.getByText(/^It’s only shown once\./u)).toBeDefined();
  });

  it('should mint the invitation from the web origin on desktop, never app://tau', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...globalThis.window.ENV,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new',
    };

    const link = await issueInvitation();

    expect(link.value).toBe('https://tau.new/invitations/tok_abcdef');
  });

  it('should tell a desktop owner where the link lands and what happens after it', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...globalThis.window.ENV,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new',
    };

    await issueInvitation();

    /* The desktop shell has no inbound link path, so the invitee completes in a
       browser and the project arrives on their next cloud listing (Finding 5,
       ruling Q4). */
    expect(screen.getByRole('status', { name: 'Invite link created' })).toHaveTextContent(
      'It opens in a browser. After they accept, the project appears in their Tau.',
    );
  });

  it('lists people with their role and status under the invite form', async () => {
    answer([teammate, { ...teammate, email: 'viewer@example.test', role: 'read', status: 'pending' }]);
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Collaborators' })).toBeDefined();
    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    const people = screen.getByRole('list', { name: 'Collaborators' });
    /* An accepted row needs no status; a pending one says what is still missing. */
    expect(people).not.toHaveTextContent('Accepted');
    expect(people).toHaveTextContent('viewer@example.test');
    expect(people).toHaveTextContent('Invite not accepted yet');
    expect(screen.getByRole('combobox', { name: 'Role for viewer@example.test' })).toHaveTextContent('Can view');
  });

  it('says plainly when nobody else has access', async () => {
    renderPanel();

    expect(await screen.findByText('No collaborators yet.')).toBeDefined();
  });

  /* F4: an unread list is not an empty one. */
  it('reports a listing it could not read instead of saying nobody has access', async () => {
    answer([], undefined, { status: 500 });
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load collaborators. Try again.");
    expect(screen.queryByText('No collaborators yet.')).toBeNull();
    answer([teammate]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('teammate@example.test')).toBeDefined();
  });

  /* W3 a2: a role change is `PATCH`, not a re-invite — the invitee keeps the
     link they were already sent and no new token is minted. */
  it('changes a role in place without issuing a token', async () => {
    const fetchMock = answer([teammate]);
    renderPanel();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Role for teammate@example.test' }));
    await userEvent.click(screen.getByRole('option', { name: 'Can view' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/v1/projects/proj_1/collaborators/teammate%40example.test',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'read' }) }),
      );
    });
    expect(screen.queryByRole('textbox', { name: /Invite link for/u })).toBeNull();
  });

  it('surfaces the one-time link, its expiry and who it is for, and focuses it', async () => {
    const link = await issueInvitation();

    expect(link.value).toContain('/invitations/tok_abcdef');
    expect(screen.getByRole('button', { name: /Copy link/u })).toBeDefined();
    /* F5: the link is the whole product of the gesture, so it is announced and
       it takes focus — a keyboard person must not have to hunt for it. */
    expect(screen.getByRole('status', { name: 'Invite link created' })).toHaveTextContent(
      /It works until (October 2, 2026|2 October 2026)\./u,
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(link);
    });
  });

  it.each([
    {
      status: 429,
      code: 'PROJECT_INVITE_RATE_LIMITED',
      says: 'You’ve invited too many people today. Try again tomorrow.',
    },
    { status: 403, code: undefined, says: 'Only the project owner can add collaborators.' },
    { status: 404, code: undefined, says: 'This project isn’t in the cloud yet. Back it up to the cloud first.' },
    { status: 500, code: undefined, says: 'Couldn’t invite teammate@example.test. Try again.' },
  ])('says plainly why an invite failed ($status)', async ({ status, code, says }) => {
    answer([], { status, body: code === undefined ? {} : { code } });
    renderPanel();

    await userEvent.type(await screen.findByRole('textbox', { name: 'Email address' }), 'teammate@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(says);
  });

  it('asks before removing access, then removes it and hands focus to the heading', async () => {
    const fetchMock = answer([teammate]);
    renderPanel();

    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Remove access for teammate@example.test' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Remove teammate@example.test from collaborators?' });
    expect(dialog).toHaveAccessibleDescription(
      'They’ll lose access to this project and can no longer open it. To give access back, invite them again.',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove access' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/v1/projects/proj_1/collaborators/teammate%40example.test',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    /* F5: the button the click came from is disabled with its removed row, so focus would fall to
       `<body>` — the same defect review R15 fixed on the disconnect confirm. */
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Collaborators' }));
    });
  });

  it('keeps access and returns focus to the row when the removal is cancelled', async () => {
    const fetchMock = answer([{ ...teammate, status: 'pending' }]);
    renderPanel();

    const remove = await screen.findByRole('button', { name: 'Remove access for teammate@example.test' });
    await userEvent.click(remove);
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove teammate@example.test from collaborators?' });
    expect(dialog).toHaveAccessibleDescription(
      'Their invite link will stop working, so they won’t get access to this project. To give them access later, invite them again.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(document.activeElement).toBe(remove);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
  });

  it('says the invitation was emailed, and keeps the link as a spare copy', async () => {
    answer([], {
      status: 201,
      body: {
        email: 'teammate@example.test',
        role: 'write',
        token: 'tok_abcdef',
        expiresAt: '2026-10-02T00:00:00.000Z',
        emailDelivery: { status: 'sent' },
      },
    });

    const link = await issueInvitation();

    const block = screen.getByRole('status', { name: 'Invite link created' });
    expect(block).toHaveTextContent('Invited teammate@example.test. We emailed them.');
    expect(block).toHaveTextContent(/We emailed them this link\. It’s only shown once here\./u);
    expect(block).not.toHaveTextContent(/couldn’t email/iu);
    expect(link.value).toBe(`${globalThis.location.origin}/invitations/tok_abcdef`);
  });

  it.each(['email_disabled', 'undeliverable', 'send_failed'])(
    'says it could not email them (%s) and offers the link to send, without saying why',
    async (reason) => {
      answer([], {
        status: 201,
        body: {
          email: 'teammate@example.test',
          role: 'write',
          token: 'tok_abcdef',
          expiresAt: '2026-10-02T00:00:00.000Z',
          emailDelivery: { status: 'skipped', reason },
        },
      });

      await issueInvitation();

      const block = screen.getByRole('status', { name: 'Invite link created' });
      expect(block).toHaveTextContent(
        'We couldn’t email teammate@example.test. Copy the invite link and send it yourself.',
      );
      expect(block).not.toHaveTextContent(/We emailed them|disabled|undeliverable|bounce|fail/iu);
      expect(within(block).getByRole('button', { name: /Copy link/u })).toBeDefined();
    },
  );

  it('creates the invite link from the email field with Enter', async () => {
    const fetchMock = answer();
    renderPanel();

    await userEvent.type(await screen.findByRole('textbox', { name: 'Email address' }), 'teammate@example.test{Enter}');

    expect(await screen.findByRole('textbox', { name: 'Invite link for teammate@example.test' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/projects/proj_1/collaborators',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lists five people in flow and the rest on request', async () => {
    answer(
      Array.from({ length: 7 }, (_unused, index) => ({ ...teammate, email: `person${String(index)}@example.test` })),
    );
    renderPanel();

    const people = await screen.findByRole('list', { name: 'Collaborators' });
    expect(within(people).getAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }));
    expect(within(people).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('says a removed person no longer has access', async () => {
    answer([{ ...teammate, status: 'revoked' }]);
    renderPanel();

    expect(await screen.findByRole('list', { name: 'Collaborators' })).toHaveTextContent('Access removed');
  });
});

describe('ProjectPeopleWithAccess', () => {
  it('lists people and invites in Share for the owner of a Tau Cloud project', async () => {
    answer([teammate]);
    renderPanel(<ProjectPeopleWithAccess projectId='proj_1' />);

    const section = screen.getByRole('region', { name: 'Collaborators' });
    expect(section.querySelector('[data-slot=share-people]')).not.toBeNull();
    /* In the pane's one scroll area: the section neither scrolls nor bounds its own height. */
    expect(section.outerHTML).not.toMatch(/overflow-y-auto|max-h-/u);
    expect(section).toHaveTextContent(
      'Collaborators open this project itself and see your latest changes. People with a link see only what you shared.',
    );
    /* One row, always open: the address, the role and the button, with no disclosure in front of them. */
    const form = screen.getByRole('form', { name: 'Add a collaborator' });
    const field = await within(form).findByRole('textbox', { name: 'Email address' });
    expect(within(form).getByRole('button', { name: 'Invite' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add collaborator|done/iu })).toBeNull();
    expect(field).toHaveAccessibleDescription('They’ll need an account with this email address to accept.');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('Can edit');
    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    expect(screen.getByRole('list', { name: 'Collaborators' })).toHaveTextContent('teammate@example.test');
  });

  /* N4: every route behind it needs `owner` and a Tau Cloud project. */
  it.each([
    { name: 'a write collaborator', role: 'write', kind: 'tau', phase: 'connected' },
    { name: 'a view-only collaborator', role: 'read', kind: 'tau', phase: 'connected' },
    { name: 'a GitHub backup', role: 'owner', kind: 'git', phase: 'connected' },
    { name: 'a project on this device only', role: 'owner', kind: 'none', phase: 'none' },
    { name: 'a backup still connecting', role: 'owner', kind: 'tau', phase: 'connecting' },
  ] as const)('shows nothing for $name', ({ role, kind, phase }) => {
    const fetchMock = answer([teammate]);
    viewer.role = role;
    viewer.remote = { kind, phase };
    renderPanel(<ProjectPeopleWithAccess projectId='proj_1' />);

    expect(screen.queryByRole('region', { name: 'Collaborators' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
