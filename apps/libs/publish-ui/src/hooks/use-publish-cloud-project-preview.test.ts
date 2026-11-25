import { Blob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { publishCloudProjectPreview, usePublishCloudProjectPreview } from '#hooks/use-publish-cloud-project-preview.js';

// This test exercises the producer boundary: the app's session user, thumbnail and API base arrive as inputs.
const apiBaseUrl = (): string => 'https://api.test/';
const readyThumbnail = (url?: string) => ({ url, status: 'ready' }) as const;
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saved catalog preview producer', () => {
  it('should resize an existing capture and upload only its bounded WebP derivative', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const convertToBlob = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }));
    const dimensions: number[][] = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1536, height: 1152, close })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        public convertToBlob = convertToBlob;
        // oxlint-disable-next-line @typescript-eslint/parameter-properties -- Vitest specs use erasableSyntaxOnly, which forbids parameter properties.
        public width: number;
        // oxlint-disable-next-line @typescript-eslint/parameter-properties -- Vitest specs use erasableSyntaxOnly, which forbids parameter properties.
        public height: number;
        public constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          dimensions.push([width, height]);
        }
        public getContext() {
          return { drawImage };
        }
      },
    );
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal('fetch', fetcher);
    await publishCloudProjectPreview({
      apiBaseUrl,
      projectId: 'project',
      source: 'blob:local-thumbnail',
      createOnly: true,
      signal: new AbortController().signal,
    });
    expect(dimensions).toEqual([[768, 576]]);
    expect(close).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://api.test/v1/projects/project/preview',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ image: 'AQID' }),
      }),
    );
  });

  it('should hold a verified fresh capture until authored sync settles, then replace the old saved preview', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 768, height: 576, close: vi.fn() })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        public width = 768;
        public height = 576;
        public getContext() {
          return { drawImage: vi.fn() };
        }
        public async convertToBlob() {
          return new Blob([new Uint8Array([1])], { type: 'image/webp' });
        }
      },
    );
    const fetcher = vi.fn<typeof fetch>(async () => new Response());
    vi.stubGlobal('fetch', fetcher);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) =>
        usePublishCloudProjectPreview({
          projectId: 'project',
          enabled,
          captureEnabled: true,
          userId: 'owner',
          thumbnail: readyThumbnail(),
          apiBaseUrl,
        }),
      {
        initialProps: { enabled: false },
        wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
      },
    );
    act(() => {
      result.current(new Uint8Array([1]));
    });
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce();
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('If-None-Match');
    unmount();
    client.clear();
  });

  it.each(['account', 'project', 'disconnect'] as const)(
    'should discard a pending capture after its %s scope changes',
    async (change) => {
      const bitmap = vi.fn();
      vi.stubGlobal('createImageBitmap', bitmap);
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const { result, rerender, unmount } = renderHook((props) => usePublishCloudProjectPreview(props), {
        initialProps: {
          projectId: 'project',
          enabled: false,
          captureEnabled: true,
          userId: 'owner',
          thumbnail: readyThumbnail(),
          apiBaseUrl,
        },
        wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
      });
      act(() => {
        result.current(new Uint8Array([1]));
      });
      const userId = change === 'account' ? 'other' : 'owner';
      const projectId = change === 'project' ? 'other-project' : 'project';
      const scope = { projectId, userId, thumbnail: readyThumbnail(), apiBaseUrl };
      rerender({ ...scope, enabled: false, captureEnabled: change !== 'disconnect' });
      await act(async () => {
        rerender({ ...scope, enabled: true, captureEnabled: true });
      });
      expect(bitmap).not.toHaveBeenCalled();
      unmount();
      client.clear();
    },
  );

  it('should backfill a project the server already holds a preview for once per session, not on every open', async () => {
    // Tau #2012: each open re-sent the create-only backfill and the API answered 412 every time.
    // The hook's saved-preview set lives for the module, so this test uses ids no other test uses.
    const scope = { userId: 'owner-2012', thumbnail: readyThumbnail('blob:local-thumbnail'), apiBaseUrl };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 768, height: 576, close: vi.fn() })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        public width = 768;
        public height = 576;
        public getContext() {
          return { drawImage: vi.fn() };
        }
        public async convertToBlob() {
          return new Blob([new Uint8Array([1])], { type: 'image/webp' });
        }
      },
    );
    const urlOf = (input: Parameters<typeof fetch>[0]): string =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      urlOf(input).startsWith('blob:') ? new Response(new Uint8Array([1])) : new Response(null, { status: 412 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const uploads = (): number => fetcher.mock.calls.filter(([input]) => urlOf(input).startsWith('https:')).length;
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const first = renderHook(
      () => usePublishCloudProjectPreview({ ...scope, projectId: 'project-2012', enabled: true }),
      {
        wrapper,
      },
    );
    await waitFor(() => {
      expect(uploads()).toBe(1);
    });
    await waitFor(() => {
      expect(client.isMutating()).toBe(0);
    });
    first.unmount();
    const second = renderHook(
      () => usePublishCloudProjectPreview({ ...scope, projectId: 'project-2012', enabled: true }),
      {
        wrapper,
      },
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(uploads()).toBe(1);
    second.unmount();
    client.clear();
  });

  it('should release the bitmap and refuse oversized derivatives without uploading', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1536, height: 1152, close })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        public width = 768;
        public height = 576;
        public getContext() {
          return { drawImage: vi.fn() };
        }
        public async convertToBlob() {
          return new Blob([new Uint8Array(262_145)], { type: 'image/webp' });
        }
      },
    );
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      publishCloudProjectPreview({
        apiBaseUrl,
        projectId: 'project',
        source: 'blob:local-thumbnail',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('transfer limit');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
