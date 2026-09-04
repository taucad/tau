import { once } from 'node:events';
import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { waitForUrl } from '#wait-for-url.js';

describe('waitForUrl', () => {
  it('returns once a server accepts connections', async () => {
    const server = createServer((_request, response) => response.end());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    await expect(waitForUrl(`http://127.0.0.1:${address.port}`, 0)).resolves.toBeUndefined();
    server.close();
  });
});
