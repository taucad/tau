import { vi } from 'vitest';
import { sha256BytesSync } from '@taucad/utils/hash';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';

/**
 * Give a mocked composed-view client the authority's digested read (D17).
 *
 * A deep mock answers every member, so `readFileWithDigest` looks served but
 * resolves `undefined`. This fake reads through the double's own `readFile`
 * at call time, so a test that re-stubs `readFile` keeps steering content,
 * and hashes on the fake's side of the wire.
 *
 * @param proxy - The mocked client.
 * @returns The same client.
 */
export const withAuthorityDigest = <Client extends ComposedViewClient>(proxy: Client): Client => {
  proxy.readFileWithDigest = vi.fn(async (path: string) => {
    const data = await proxy.readFile(path);
    return { data, sha256: sha256BytesSync(data) };
  });
  return proxy;
};
