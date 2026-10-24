/** Exercise real HTTPS admission and latest replacement without installing trust or publishing receipts. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Exercise the script-owned transport without a public runtime export.
import { startQualificationMirrorProcess as startQualificationMirror } from './qualification-mirror-process.mjs';

await test('should serve authenticated exact bytes and refuse immutable replacement and tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-mirror-'));
  try {
    const key = join(root, 'key.pem');
    const certificate = join(root, 'certificate.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        certificate,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    );
    const ca = await readFile(certificate, 'utf8');
    const make = async (name: string, content: string) => {
      const path = join(root, name);
      await writeFile(path, content);
      return {
        path,
        sha256: createHash('sha256').update(content).digest('hex'),
        size: Buffer.byteLength(content),
        contentType: 'application/octet-stream',
      };
    };
    const before = await make('before', 'signed B');
    const after = await make('after', 'signed C');
    const mirror = await startQualificationMirror({
      key: await readFile(key, 'utf8'),
      certificate: ca,
      objects: new Map([
        ['/releases/B/app', before],
        ['/latest/descriptor', before],
      ]),
    });
    const request = async (path: string): Promise<{ status: number | undefined; body: string }> =>
      new Promise((resolve, reject) => {
        get(`${mirror.origin}${path}`, { ca }, (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            body += chunk;
          });
          response.on('end', () => {
            resolve({ status: response.statusCode, body });
          });
        }).on('error', reject);
      });
    try {
      assert.deepEqual(await request('/latest/descriptor'), { status: 200, body: 'signed B' });
      const synchronous = execFileSync(
        'curl',
        ['--fail', '--silent', '--cacert', certificate, `${mirror.origin}/latest/descriptor`],
        { encoding: 'utf8', timeout: 10_000 },
      );
      assert.equal(synchronous, 'signed B');
      await mirror.setAvailable(false);
      const offline = await request('/latest/descriptor');
      assert.equal(offline.status, 503);
      await mirror.setAvailable(true);
      assert.deepEqual(await request('/latest/descriptor'), { status: 200, body: 'signed B' });
      await mirror.switchLatest(new Map([['/latest/descriptor', after]]));
      assert.deepEqual(await request('/latest/descriptor'), { status: 200, body: 'signed C' });
      assert.deepEqual(await request('/releases/B/app'), { status: 200, body: 'signed B' });
      await assert.rejects(
        mirror.switchLatest(new Map([['/releases/B/app', after]])),
        /cannot replace an immutable release/u,
      );
      const missing = await request('/missing');
      assert.equal(missing.status, 404);
      await writeFile(after.path, 'tampered');
      const changed = await request('/latest/descriptor');
      assert.equal(changed.status, 500);
      await mirror.flush();
      assert.equal(mirror.requests.at(-1)?.status, 500);
    } finally {
      await mirror.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
