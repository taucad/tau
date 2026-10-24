#!/usr/bin/env node
/**
 * Check the local calibration server's capture trust boundary without writing a capture.
 * Optional NODE_EXTRA_CA_CERTS: trusted development CA for HTTPS. Requires a local diagnostic server.
 * Usage: node apps/ui/scripts/render-calibration/check-server.mts [http://127.0.0.1:3005]
 * Exit codes: 0 checks passed; 1 invalid arguments, rejection failure or unavailable server.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import { connect } from 'node:http2';
import { networkInterfaces } from 'node:os';

const main = async (): Promise<void> => {
  const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3005');
  const localAddresses = Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).map((address) => address.address),
  );
  assert.ok(['localhost', ...localAddresses].includes(origin.hostname), 'Use a server bound to this machine');
  const endpoint = new URL('/calibration-capture', origin);
  const body = {
    name: 'check-server',
    image: 'data:image/png;base64,AAAA',
    metadata: {},
  };
  const getResponse = await fetch(endpoint);
  assert.equal(getResponse.status, 403, 'GET must be rejected');
  await Promise.all(
    (
      [
        ['https://untrusted.example', JSON.stringify(body), 403],
        ['null', JSON.stringify(body), 403],
        [origin.origin, '{', 400],
        [origin.origin, JSON.stringify({ ...body, name: '../escape' }), 400],
        [origin.origin, JSON.stringify(body), 400],
      ] as const
    ).map(async ([requestOrigin, payload, status]) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { origin: requestOrigin },
        body: payload,
      });
      assert.equal(response.status, status, `POST ${requestOrigin}: ${await response.text()}`);
    }),
  );
  console.log('Calibration server rejected cross-origin, invalid method, JSON, path and PNG inputs.');

  // Fetch negotiates HTTP/1.1 in Node. Exercise the actual HTTP/2 authority path as well.
  if (origin.protocol === 'https:') {
    const session = connect(origin.origin);
    try {
      await Promise.all(
        [origin.origin, 'https://untrusted.example', 'null', undefined].map(async (requestOrigin) => {
          const expectedStatus = requestOrigin === origin.origin ? 400 : 403;
          await new Promise<void>((resolve, reject) => {
            const request = session.request({
              ':method': 'POST',
              ':path': endpoint.pathname,
              ...(requestOrigin === undefined ? {} : { origin: requestOrigin }),
            });
            let status: number | undefined;
            request.on('response', (headers) => {
              status = headers[':status'];
            });
            request.on('error', reject);
            session.once('error', reject);
            request.on('end', () => {
              session.removeListener('error', reject);
              try {
                assert.equal(status, expectedStatus, `HTTP/2 POST origin ${requestOrigin ?? '(absent)'}`);
                resolve();
              } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
              }
            });
            request.resume();
            request.end('{}');
          });
        }),
      );
      console.log('HTTP/2 accepts same-origin authority and rejects foreign, null and missing origins.');
    } finally {
      session.close();
    }
  }
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
