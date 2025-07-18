import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { JSX } from 'react';
import { TooltipProvider } from '~/components/ui/tooltip.js';
import Index from '~/routes/_index/route.js';

// Test wrapper component that provides necessary providers
function TestWrapper({ children }: { readonly children: React.ReactNode }): JSX.Element {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: 'offlineFirst',
            retry: false, // Disable retries in tests
          },
          mutations: {
            networkMode: 'offlineFirst',
            retry: false, // Disable retries in tests
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

test('renders loader data', async () => {
  const RemixStub = createRoutesStub([
    {
      path: '/',
      Component: Index,
    },
  ]);

  render(
    <TestWrapper>
      <RemixStub />
    </TestWrapper>,
  );

  await waitFor(async () => screen.findByText('What can I help you build?'));
});
