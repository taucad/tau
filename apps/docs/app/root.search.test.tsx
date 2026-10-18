// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createSearchAPI } from 'fumadocs-core/search/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '#root.js';

vi.mock('#lib/fumadocs/static-search.server.js', () => ({ getStaticSearchIndexUrl: vi.fn() }));

const indexUrl = '/build/docs-search-index.json?fixture=dialog';
let router: ReturnType<typeof createMemoryRouter> | undefined;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      public observe(): void {
        // JSDOM has no layout; mirror the shared UI test observer contract.
      }

      public unobserve(): void {
        // No observed layout resources in jsdom.
      }

      public disconnect(): void {
        // No observed layout resources in jsdom.
      }
    },
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});

afterEach(() => {
  cleanup();
  router?.dispose();
  router = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('should search the exact static index and navigate through the provider keyboard contract', async () => {
  const search = createSearchAPI('simple', {
    indexes: [{ title: 'Replicad', content: 'Parametric CAD solids', url: '/runtime/reference/replicad' }],
  });
  const indexResponse: Response = await search.staticGET();
  const indexBytes = await indexResponse.text();
  const fetchIndex = vi.fn(async (input: RequestInfo | URL) => {
    if (input !== indexUrl) {
      throw new Error('Unexpected search request: expected the exact static index URL');
    }
    return new Response(indexBytes, { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchIndex);
  router = createMemoryRouter([
    {
      path: '/',
      Component: App,
      loader: () => ({ searchIndexUrl: indexUrl }),
      children: [
        { index: true, element: <button type='button'>Documentation home</button> },
        { path: 'runtime/reference/replicad', element: <h1>Replicad reference page</h1> },
      ],
    },
  ]);
  render(<RouterProvider router={router} />);
  const origin = await screen.findByRole('button', { name: 'Documentation home' });
  origin.focus();
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  const input = await screen.findByRole('combobox', { name: 'Search' });
  await waitFor(() => {
    expect(document.activeElement).toBe(input);
  });
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  fireEvent.change(input, { target: { value: 'Replicad' } });
  await screen.findByRole('option', { name: /Replicad/u });
  expect(fetchIndex).toHaveBeenCalledWith(indexUrl);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('heading', { name: 'Replicad reference page' });
  expect(router.state.location.pathname).toBe('/runtime/reference/replicad');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  const reopened = await screen.findByRole('combobox', { name: 'Search' });
  fireEvent.change(reopened, { target: { value: 'NoSuchDocumentationTerm' } });
  await screen.findByText('No results found');
  fireEvent.keyDown(reopened, { key: 'Escape' });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
