/**
 * @vitest-environment jsdom
 *
 * Browser compatibility gate for production runtime entries.
 */

import { describe, expect, it } from 'vitest';
import type * as NextRuntimeModule from '#nextjs/config.js';

describe('browser compatibility', () => {
  it('imports the browser-safe runtime entries', async () => {
    const root = await import('#index.js');
    const client = await import('#client/index.js');
    const filesystem = await import('#filesystem/index.js');
    const middleware = await import('#middleware/runtime-middleware.js');

    expect(root.fromFsLike).toBeTypeOf('function');
    expect(client.createRuntimeClient).toBeTypeOf('function');
    expect(filesystem.fromMemoryFs).toBeTypeOf('function');
    expect(middleware.defineMiddleware).toBeTypeOf('function');
    expect('inProcessTransport' in root).toBe(false);
    expect('inProcessTransport' in client).toBe(false);
  }, 30_000);

  it('imports the concrete Next.js config entry', async () => {
    const nextRuntime: typeof NextRuntimeModule = await import('#nextjs/config.js');
    const [headerConfig] = nextRuntime.nextRuntimeHeaders();

    expect(nextRuntime.withTauRuntime).toBeTypeOf('function');
    expect(headerConfig?.source).toBe('/:path*');
    expect('inProcessTransport' in nextRuntime).toBe(false);
  });
});
