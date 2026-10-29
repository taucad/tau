import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

// oxlint-disable-next-line no-restricted-imports -- Exercise the script-owned transport directly.
import { verifyMirrorReadback } from './mirror-readback.mjs';

const bytes = Buffer.from('complete archive fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');

/** Include transport regressions in the existing standalone publisher test gate. */
export async function runMirrorReadbackTests(): Promise<void> {
  await Promise.all(
    ['recover', 'interrupt', 'digest', 'size', 'http'].map(async (scenario) =>
      test(`Mirror readback: ${scenario}`, async () => {
        let requests = 0;
        const server = createServer((request, response) => {
          requests += 1;
          assert.equal(request.headers.range, undefined, 'Every attempt must start at byte zero');
          if (scenario === 'interrupt' || (scenario === 'recover' && requests === 1)) {
            response.writeHead(200, { 'content-length': bytes.length });
            response.write(bytes.subarray(0, 4));
            // Deliver headers and partial bytes before closing the socket mid-body.
            setTimeout(() => response.destroy(), 20);
          } else if (scenario === 'http') {
            response.writeHead(503).end('unavailable');
          } else {
            response.end(scenario === 'digest' ? Buffer.alloc(bytes.length) : bytes);
          }
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        try {
          const verification = verifyMirrorReadback({
            url: `http://127.0.0.1:${address.port}/archive`,
            name: 'Tau-linux-x64.tar.gz',
            sha256,
            size: scenario === 'size' ? bytes.length + 1 : bytes.length,
          });
          if (scenario === 'recover') {
            await verification;
            assert.equal(requests, 2);
          } else {
            await assert.rejects(verification, {
              name: 'Error',
              message:
                scenario === 'interrupt'
                  ? 'Public mirror transport failed: Tau-linux-x64.tar.gz (UND_ERR_SOCKET, attempt 3/3)'
                  : scenario === 'http'
                    ? 'Public mirror unavailable: Tau-linux-x64.tar.gz (HTTP 503)'
                    : 'Public mirror bytes disagree: Tau-linux-x64.tar.gz',
            });
            assert.equal(requests, scenario === 'interrupt' ? 3 : 1);
          }
        } finally {
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });
        }
      }),
    ),
  );

  await test('Mirror readback: unknown fetch failures are terminal and diagnostics omit credentials', async () => {
    await assert.rejects(
      verifyMirrorReadback({
        url: 'https://user:password@localhost/archive',
        name: '../Tau-\nlinux.zip',
        sha256,
        size: bytes.length,
      }),
      {
        name: 'Error',
        message: 'Public mirror transport failed: Tau-_linux.zip (UNKNOWN, attempt 1/3)',
      },
    );
  });
}
