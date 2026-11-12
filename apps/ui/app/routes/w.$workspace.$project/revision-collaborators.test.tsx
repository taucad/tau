/**
 * People with access, in the Share panel (C4, Q5; charter W5, D27).
 *
 * The owner alone manages this surface, and there is no invitation email — so
 * the one-time link the API answers with *is* the product: if this panel does
 * not show it, the invitation cannot reach anybody.
 *
 * The desktop document origin is `app://tau`, a scheme only this app can open,
 * so an invitation built from `location.origin` was unusable by the one person
 * it was for (`docs/research/desktop-share-links-blueprint.md`, L1); the first
 * rows are that host difference.
 */

import { render, screen, waitFor } from '@testing-library/react';
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

  await userEvent.type(await screen.findByRole('textbox', { name: 'Invite by email' }), 'teammate@example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Create invite link' }));

  return screen.findByRole('textbox', { name: 'Invitation link for teammate@example.test' });
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
    expect(screen.getByRole('status', { name: 'Invitation created' }).classList.contains('ph-no-capture')).toBe(true);
    expect(screen.getByText('Tau does not email this link. Send it to them yourself.')).toBeDefined();
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
    expect(
      screen.getByText('This link opens in the browser. Once they accept, the project appears in their Tau.'),
    ).toBeDefined();
    expect(screen.queryByText('Tau does not email this link. Send it to them yourself.')).toBeNull();
  });

  it('lists people with their role and status under the invite form', async () => {
    answer([teammate, { ...teammate, email: 'viewer@example.test', role: 'read', status: 'pending' }]);
    renderPanel();

    expect(screen.getByRole('heading', { name: 'People with access' })).toBeDefined();
    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    const people = screen.getByRole('list', { name: 'People with access' });
    expect(people).toHaveTextContent('Accepted');
    expect(people).toHaveTextContent('viewer@example.test');
    expect(people).toHaveTextContent('Invited');
    expect(screen.getByRole('combobox', { name: 'Role for viewer@example.test' })).toHaveTextContent('Can view');
  });

  it('says plainly when nobody else has access', async () => {
    renderPanel();

    expect(await screen.findByText('Nobody else has access to this project.')).toBeDefined();
  });

  /* F4: an unread list is not an empty one. */
  it('reports a listing it could not read instead of saying nobody has access', async () => {
    answer([], undefined, { status: 500 });
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('The list of people with access could not be loaded.');
    expect(screen.queryByText('Nobody else has access to this project.')).toBeNull();
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
    expect(screen.queryByRole('textbox', { name: /Invitation link for/u })).toBeNull();
  });

  it('surfaces the one-time link, its expiry and who it is for, and focuses it', async () => {
    const link = await issueInvitation();

    expect(link.value).toContain('/invitations/tok_abcdef');
    expect(screen.getByRole('button', { name: /Copy link/u })).toBeDefined();
    /* F5: the link is the whole product of the gesture, so it is announced and
       it takes focus — a keyboard person must not have to hunt for it. */
    expect(screen.getByRole('status', { name: 'Invitation created' })).toBeDefined();
    await waitFor(() => {
      expect(document.activeElement).toBe(link);
    });
  });

  it.each([
    { status: 429, code: 'PROJECT_INVITE_RATE_LIMITED', says: 'Too many invitations today. Try again tomorrow.' },
    { status: 500, code: undefined, says: 'Couldn’t create the invite. Try again.' },
  ])('says plainly why an invite failed ($status)', async ({ status, code, says }) => {
    answer([], { status, body: code === undefined ? {} : { code } });
    renderPanel();

    await userEvent.type(await screen.findByRole('textbox', { name: 'Invite by email' }), 'teammate@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(says);
  });

  it('removes access at once, then hands focus to the heading', async () => {
    const fetchMock = answer([teammate]);
    renderPanel();

    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Remove access for teammate@example.test' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/v1/projects/proj_1/collaborators/teammate%40example.test',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    /* F5: the button the click came from is gone, so focus would fall to
       `<body>` — the same defect review R15 fixed on the disconnect confirm. */
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'People with access' }));
    });
  });
});

describe('ProjectPeopleWithAccess', () => {
  it('lists people and invites in Share for the owner of a Tau Cloud project', async () => {
    answer([teammate]);
    renderPanel(<ProjectPeopleWithAccess projectId='proj_1' />);

    const section = screen.getByRole('region', { name: 'People with access' });
    expect(section).toHaveAttribute('data-slot', 'share-people');
    expect(await screen.findByRole('textbox', { name: 'Invite by email' })).toBeDefined();
    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    expect(screen.getByRole('list', { name: 'People with access' })).toHaveTextContent('teammate@example.test');
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

    expect(screen.queryByRole('region', { name: 'People with access' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
