/**
 * The SPA builds' prerender (desktop and `tau serve`, `ssr: false`) renders the document with an unstarted app
 * runtime, so `SessionsProvider` has a registry to read. React Router's default server entry rendered none, and the
 * prerender of `index.html` answered 500 (`SessionsProvider must be used within <AppRuntimeProvider>`).
 */
import { createStaticHandler } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';
import { mock, mockDeep } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
import handleRequest from '#runtime/app-runtime-spa-entry.server.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { SessionsProvider, useLiveProjectIds } from '#hooks/use-sessions.js';
import { useAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectAppEnvironment } from '#runtime/app-runtime.js';

vi.mock('#hooks/use-file-manager.js', () => ({ useSharedFileManagerWorker: () => undefined }));

/* The SPA prerender renders the root's `Layout` around its fallback, as the desktop and serve roots export. */
function Layout({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { visible } = selectAppEnvironment(useAppRuntime().getSnapshot());
  return (
    <UnloadProvider>
      <SessionsProvider>
        <Live visible={visible} />
        {children}
      </SessionsProvider>
    </UnloadProvider>
  );
}

function Live({ visible }: { readonly visible: boolean | undefined }): React.JSX.Element {
  return (
    <p>
      live {useLiveProjectIds().length}, visible {String(visible)}
    </p>
  );
}

const spaContext = async (request: Request): Promise<EntryContext> => {
  const handler = createStaticHandler([{ id: 'root', path: '*' }]);
  const staticHandlerContext = await handler.query(request);
  if (staticHandlerContext instanceof Response) {
    throw new TypeError('Expected a document context');
  }
  const context = mock<EntryContext>({
    staticHandlerContext,
    serverHandoffStream: undefined,
    isSpaMode: true,
    branches: undefined,
    manifest: mockDeep<EntryContext['manifest']>({
      entry: { module: '/entry.js', imports: [] },
      routes: {
        root: {
          id: 'root',
          parentId: undefined,
          path: '*',
          index: false,
          module: '/root.js',
          hasLoader: false,
          hasClientLoader: false,
        },
      },
    }),
    future: mock<EntryContext['future']>(),
  });
  context.routeModules = { root: { default: () => null, Layout } };
  return context;
};

describe('SPA prerender entry', () => {
  it('should prerender the document with an unstarted app runtime', async () => {
    const request = new Request('http://localhost/');
    const response = await handleRequest(
      request,
      200,
      new Headers(),
      await spaContext(request),
      mock<AppLoadContext>(),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    /* The initial snapshot: no live project, and environment has not reported because nothing started it. */
    expect(body).toContain('<p>live <!-- -->0<!-- -->, visible <!-- -->undefined</p>');
  });

  it('should answer HEAD without rendering', async () => {
    const request = new Request('http://localhost/', { method: 'HEAD' });
    const response = await handleRequest(
      request,
      204,
      new Headers(),
      await spaContext(request),
      mock<AppLoadContext>(),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
