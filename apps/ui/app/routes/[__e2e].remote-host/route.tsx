/* eslint-disable @nx/enforce-module-boundaries -- This debug-only React Router route is itself lazy-loaded. */
import { useEffect, useRef, useState } from 'react';
import { useLoaderData } from 'react-router';

import { createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { getEnvironment } from '#environment.config.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = { enablePageWrapper: false };

const source = [
  "import { makeBaseBox } from 'replicad';",
  'export default function main() {',
  '  return makeBaseBox(10, 42, 30);',
  '}',
].join('\n');

export const loader = async ({ request }: { readonly request: Request }): Promise<{ readonly url: string }> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  const url = new URL(new URL(request.url).searchParams.get('url') ?? '');
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1') {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Invalid host fixture URL', { status: 400 });
  }
  return { url: url.href };
};

export default function RemoteHostDebugRoute(): React.JSX.Element {
  const { url } = useLoaderData<typeof loader>();
  const started = useRef(false);
  const [result, setResult] = useState<
    | { readonly state: 'connecting' }
    | { readonly state: 'remote'; readonly bytes: number; readonly hash: string }
    | { readonly state: 'disconnected'; readonly message: string }
  >({ state: 'connecting' });

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const client = createRuntimeClient({
      transport: webSocketTransport({
        url,
        fileSystem: fromMemoryFs({ 'main.ts': source }),
      }),
    });
    const run = async (): Promise<void> => {
      try {
        const exported = await client.export('glb', { source: { path: 'main.ts' } });
        if (!exported.success) {
          throw new Error(exported.issues.map((issue) => issue.message).join('; '));
        }
        const bytes = exported.data.find((artifact) => artifact.name.endsWith('.glb'))?.bytes;
        if (!bytes) {
          throw new Error('Remote runtime did not return GLB bytes.');
        }
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        setResult({ state: 'remote', bytes: bytes.byteLength, hash });
      } catch (error) {
        setResult({ state: 'disconnected', message: error instanceof Error ? error.message : String(error) });
      }
    };
    void run();
    return () => {
      client.terminate();
    };
  }, [url]);

  if (result.state === 'connecting') {
    return <main role='status'>Connecting to remote compute…</main>;
  }
  if (result.state === 'disconnected') {
    return <main role='alert'>Remote compute disconnected: {result.message}</main>;
  }
  return (
    <main role='status' data-testid='remote-host-result' data-bytes={result.bytes} data-hash={result.hash}>
      Remote compute connected
    </main>
  );
}
