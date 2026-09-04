import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubStarButton } from '#components/marketing/github-star-button.js';

const renderButton = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GithubStarButton />
    </QueryClientProvider>,
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GithubStarButton', () => {
  it('fetches the public GitHub repository directly and renders its star count', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(Object.fromEntries([['stargazers_count', 4242]])));

    renderButton();

    expect(await screen.findByText('4.2k')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith('https://api.github.com/repos/taucad/tau');
  });

  it('keeps the plain Star fallback when GitHub is unavailable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 403 }));

    renderButton();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('Star')).toBeInTheDocument();
  });
});
