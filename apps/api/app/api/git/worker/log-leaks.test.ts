import { describe, expect, it } from 'vitest';
import { loggingRedactPaths } from '#constants/app.constant.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { grantHeader, mintGrant, storagePath } from '#api/git/forwarding/contract/grant.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import { signReceipt } from '#api/git/forwarding/contract/receipt.js';
import { JsonLineLogger } from '#api/git/worker/json-logger.js';
import { findLogLeaks } from '#api/git/worker/log-leaks.js';

/**
 * DC1 (W9 review FR20): no log line from the forwarder, the worker or the LFS
 * batch route holds a grant, a receipt or an `X-Amz-Signature`. The checker
 * the staging sample is run through must find each kind, and the worker's
 * logger must leave none of them for it to find.
 */

const grant = mintGrant(
  {
    method: 'POST',
    path: storagePath('proj-dc1-log', 'git-receive-pack'),
    owner: 'user-dc1-log',
    project: 'proj-dc1-log',
    callerId: 'user-dc1-log',
    committedBy: 'user-dc1-log',
    remainingBytes: 0,
    storageLimitBytes: 0,
    recordedGeneration: 0,
    route: { store: 'r2', authoritative: true },
  },
  { key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant') },
).token;

const receipt = signReceipt(
  {
    rid: 'a'.repeat(32),
    kind: 'commit',
    owner: 'user-dc1-log',
    project: 'proj-dc1-log',
    generation: 1,
    incarnation: 'b'.repeat(32),
    manifestSha256: 'c'.repeat(64),
    movedRefs: [],
    materializedTags: [],
    reachableLfsOids: [],
  },
  { key: parseSigningKey(developmentSigningKeyJson('receipt'), 'receipt') },
);

const presigned =
  'https://account.r2.cloudflarestorage.com/tau-content-private/tenants/u/lfs/ab?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20261024%2Fauto%2Fs3%2Faws4_request&X-Amz-Signature=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('the storage log-sample check (DC1)', () => {
  it('should find a grant, a receipt, the grant header and a presigned signature in a raw sample', () => {
    const sample = [
      '{"level":"info","msg":"forwarded"}',
      `{"msg":"forwarding","headers":{"${grantHeader}":"${grant}"}}`,
      `{"msg":"receipt posted","body":"${receipt}"}`,
      `{"msg":"lfs batch","href":"${presigned}"}`,
    ].join('\n');
    expect(findLogLeaks(sample)).toEqual([
      { line: 2, kind: 'signed_token' },
      { line: 2, kind: 'grant_header' },
      { line: 3, kind: 'signed_token' },
      { line: 4, kind: 'amz_signature' },
      { line: 4, kind: 'amz_credential' },
    ]);
  });

  it('should find nothing in what the worker logger writes for the same values', () => {
    const lines: string[] = [];
    const logger = new JsonLineLogger('tau-storage', (line) => lines.push(line));
    logger.warn({ grant, operation: 'git-receive-pack' }, 'A storage grant was refused before its body was read');
    logger.log({ token: receipt, projectId: 'proj-dc1-log' }, 'A receipt was posted');
    logger.error({ err: new Error(`upload failed for ${presigned} after ${grant}`) }, 'A pack upload failed');
    logger.log({ headers: { [grantHeader]: grant }, note: `carried ${receipt}` }, 'A request arrived');
    expect(lines).toHaveLength(4);
    expect(findLogLeaks(lines.join('\n'))).toEqual([]);
    expect(lines.join('\n')).toContain('proj-dc1-log');
  });

  it('should redact the grant header and a posted receipt from the API request log', () => {
    expect(loggingRedactPaths).toContain(`req.headers["${grantHeader}"]`);
    expect(loggingRedactPaths).toContain('req.body.receipt');
  });
});
