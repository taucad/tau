/**
 * The invitation link, on the two hosts that mint it.
 *
 * The desktop document origin is `app://tau`, a scheme only this app can open,
 * so an invitation built from `location.origin` was unusable by the one person
 * it was for (`docs/research/desktop-share-links-blueprint.md`, L1). The web
 * half of this panel is covered by `revision-sync-region.test.tsx`; these rows
 * are the host difference alone.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { RevisionCollaborators } from '#routes/w.$workspace.$project/revision-collaborators.js';

const clientEnvironment = globalThis.window.ENV;

const answer = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              email: 'teammate@example.test',
              role: 'write',
              token: 'tok_abcdef',
              expiresAt: '2026-10-02T00:00:00.000Z',
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return [];
        },
      };
    }),
  );
};

const issueInvitation = async (): Promise<HTMLInputElement> => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <RevisionCollaborators projectId='proj_1' />
      </TooltipProvider>
    </QueryClientProvider>,
  );

  await userEvent.type(await screen.findByRole('textbox', { name: 'Invite by email' }), 'teammate@example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

  return screen.findByRole('textbox', { name: 'Invitation link for teammate@example.test' });
};

beforeEach(() => {
  answer();
  /* Radix's Select asks for pointer capture before it opens, and jsdom has
     none — the same shims the sync-region suite installs. */
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
    expect(screen.getByText('Tau does not email this link. Send it to them yourself.')).toBeDefined();
  });

  it('should mint the invitation from the web origin on desktop, never app://tau', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new',
    };

    const link = await issueInvitation();

    expect(link.value).toBe('https://tau.new/invitations/tok_abcdef');
  });

  it('should tell a desktop owner where the link lands and what happens after it', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
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
});
