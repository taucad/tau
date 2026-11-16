// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliverabilityBanner } from '#components/auth/settings/account/email-deliverability-banner.js';

const sessionEmail = vi.hoisted(() => ({
  value: 'person@example.test' as string | undefined,
}));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({ authClient: {} }),
  useSession: () => ({
    data: sessionEmail.value ? { user: { email: sessionEmail.value } } : undefined,
  }),
}));

const renderBanner = (response: Response | Error) => {
  const fetchMock = vi.fn<typeof fetch>();
  if (response instanceof Error) {
    fetchMock.mockRejectedValue(response);
  } else {
    fetchMock.mockResolvedValue(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EmailDeliverabilityBanner />
    </QueryClientProvider>,
  );
  return fetchMock;
};

afterEach(() => {
  sessionEmail.value = 'person@example.test';
  cleanup();
  vi.unstubAllGlobals();
});

// T10 (email bounce blueprint R11): the signed-in user is told; nothing else changes.
describe('EmailDeliverabilityBanner', () => {
  it('tells a signed-in user whose address is undeliverable, naming it, with the help contact', async () => {
    const fetchMock = renderBanner(new Response(JSON.stringify({ deliverable: false })));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not deliver email to person@example.test.');
    expect(screen.getByRole('link', { name: 'help@tau.new' })).toHaveAttribute('href', 'mailto:help@tau.new');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/email/deliverability',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('falls back to "this address" while the session has not loaded', async () => {
    sessionEmail.value = undefined;
    renderBanner(new Response(JSON.stringify({ deliverable: false })));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not deliver email to this address.');
  });

  it('shows nothing when mail to the address arrives', async () => {
    const fetchMock = renderBanner(new Response(JSON.stringify({ deliverable: true })));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing when the read fails, such as an API without the endpoint', async () => {
    const fetchMock = renderBanner(new Response('Not Found', { status: 404 }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
