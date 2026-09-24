#!/usr/bin/env node
/**
 * Check the local calibration server's capture trust boundary without writing a capture.
 * Required/optional environment variables: none. Requires the local diagnostic server.
 * Usage: node apps/ui/scripts/render-calibration/check-server.mts [http://127.0.0.1:3005]
 * Exit codes: 0 checks passed; 1 invalid arguments, rejection failure or unavailable server.
 */
import assert from 'node:assert/strict';
import process from 'node:process';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3005');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname), 'Use the local diagnostic server');
const endpoint = new URL('/calibration-capture', origin);
const body = { name: 'check-server', image: 'data:image/png;base64,AAAA', metadata: {} };
const getResponse = await fetch(endpoint);
assert.equal(getResponse.status, 403, 'GET must be rejected');
await Promise.all(
  (
    [
      ['https://untrusted.example', JSON.stringify(body), 403],
      [origin.origin, '{', 400],
      [origin.origin, JSON.stringify({ ...body, name: '../escape' }), 400],
      [origin.origin, JSON.stringify(body), 400],
    ] as const
  ).map(async ([requestOrigin, payload, status]) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { origin: requestOrigin }, body: payload });
    assert.equal(response.status, status, `POST ${requestOrigin}: ${await response.text()}`);
  }),
);
console.log('Calibration server rejected cross-origin, invalid method, JSON, path and PNG inputs.');
