import { generateKeyPairSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  grantContractVersion,
  grantLifetimeSeconds,
  maximumGrantClockSkewSeconds,
  mintGrant,
  verifyGrant,
} from '#api/git/forwarding/contract/grant.js';
import type { StorageGrantFacts } from '#api/git/forwarding/contract/grant.js';
import { encodeReceiptPrefix, readReceiptPrefix } from '#api/git/forwarding/contract/framing.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { SigningKey, VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import { receiptContractVersion, signReceipt, verifyReceipt } from '#api/git/forwarding/contract/receipt.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';

/**
 * The tau-api <-> tau-storage contract (DC1; W9 Finding 2, "Grant and receipt
 * specification", review FR2, FR6, FR12). Every refusal the specification
 * lists is a row here, red before the contract existed.
 */

const pair = (kid: string): { signing: SigningKey; verifying: VerificationKeys; publicPem: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return {
    signing: parseSigningKey(
      JSON.stringify({ kid, alg: 'Ed25519', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
      'TAU_STORAGE_GRANT_SIGNING_KEY',
    ),
    verifying: parsePublicKeys(
      JSON.stringify([{ kid, alg: 'Ed25519', publicKeyPem: publicPem }]),
      'TAU_STORAGE_GRANT_PUBLIC_KEYS',
    ),
    publicPem,
  };
};

const grantKeys = pair('grant-1-0315d27631832128');
const receiptKeys = pair('receipt-1-3ba45a8542d7d595');

const pushPath = '/v1/storage/proj-1/git-receive-pack';
const fetchPath = '/v1/storage/proj-1/git-upload-pack';

const facts: StorageGrantFacts = {
  method: 'POST',
  path: pushPath,
  owner: 'user-owner',
  project: 'proj-1',
  callerId: 'user-owner',
  committedBy: 'user-owner',
  remainingBytes: 1024,
  storageLimitBytes: 4096,
  quotaSentence: 'Your plan is full.',
  recordedGeneration: 3,
  route: { store: 'r2', authoritative: true },
};

const now = Date.UTC(2026, 9, 24, 12, 0, 0);

const verifyAt = (
  token: string,
  overrides: Partial<Parameters<typeof verifyGrant>[1]> = {},
): ReturnType<typeof verifyGrant> =>
  verifyGrant(token, {
    keys: grantKeys.verifying,
    method: 'POST',
    path: pushPath,
    now,
    replay: new ReplayGuard({ now: () => now }),
    ...overrides,
  });

describe('storage grant (DC1, W9 Finding 2)', () => {
  it('should verify a grant it minted and hand back every fact', () => {
    const { token, grant } = mintGrant(facts, { key: grantKeys.signing, now });
    const verified = verifyAt(token);

    expect(verified).toEqual({ ok: true, grant });
    expect(grant).toMatchObject({
      ...facts,
      v: grantContractVersion,
      kid: 'grant-1-0315d27631832128',
      iat: now / 1000,
      exp: now / 1000 + grantLifetimeSeconds,
    });
    expect(grant.rid).toMatch(/^[\da-f]{32}$/u);
  });

  it('should refuse a grant under a key id the verifier does not hold', () => {
    const stranger = pair('grant-2-ffffffffffffffff');
    const { token } = mintGrant(facts, { key: stranger.signing, now });

    expect(verifyAt(token)).toEqual({ ok: false, reason: 'unknown_kid' });
  });

  it('should refuse a grant whose signature is not the named key’s, even under the right kid', () => {
    const impostor = pair('grant-1-0315d27631832128');
    const { token } = mintGrant(facts, { key: impostor.signing, now });

    expect(verifyAt(token)).toEqual({ ok: false, reason: 'signature' });
  });

  it('should accept contract versions N and N-1 and refuse N-2', () => {
    const at = (version: number): ReturnType<typeof verifyGrant> =>
      verifyAt(mintGrant(facts, { key: grantKeys.signing, now, version }).token, { version: 3 });

    expect(at(3).ok).toBe(true);
    expect(at(2).ok).toBe(true);
    expect(at(1)).toEqual({ ok: false, reason: 'version' });
    expect(at(4)).toEqual({ ok: false, reason: 'version' });
  });

  it.each([
    ['ahead', maximumGrantClockSkewSeconds + 1],
    ['behind', -(maximumGrantClockSkewSeconds + 1)],
  ])('should refuse a grant whose iat is %s of the verifier’s clock by more than 30 s', (_label, skewSeconds) => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now: now + skewSeconds * 1000 });

    expect(verifyAt(token)).toEqual({ ok: false, reason: 'iat_skew' });
  });

  it('should accept a grant inside the 30 s skew on either side', () => {
    for (const skewSeconds of [maximumGrantClockSkewSeconds, -maximumGrantClockSkewSeconds]) {
      const { token } = mintGrant(facts, { key: grantKeys.signing, now: now + skewSeconds * 1000 });
      expect(verifyAt(token).ok).toBe(true);
    }
  });

  it('should refuse an expired grant', () => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now, lifetimeSeconds: 10 });

    expect(verifyAt(token, { now: now + 11_000 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('should refuse a grant forwarded to a path it does not name', () => {
    const { token } = mintGrant({ ...facts, path: fetchPath }, { key: grantKeys.signing, now });

    expect(verifyAt(token)).toEqual({ ok: false, reason: 'path' });
  });

  it('should refuse a grant forwarded with another method', () => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now });

    expect(verifyAt(token, { method: 'GET' })).toEqual({ ok: false, reason: 'method' });
  });

  it('should refuse a replayed request id on the same worker', () => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now });
    const replay = new ReplayGuard({ now: () => now });

    expect(verifyAt(token, { replay }).ok).toBe(true);
    expect(verifyAt(token, { replay })).toEqual({ ok: false, reason: 'replay' });
  });

  it('should not burn the request id of a grant refused for another reason', () => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now });
    const replay = new ReplayGuard({ now: () => now });

    expect(verifyAt(token, { replay, path: fetchPath }).ok).toBe(false);
    expect(verifyAt(token, { replay }).ok).toBe(true);
  });

  it('should refuse a tampered payload and a header whose kid disagrees with its payload', () => {
    const { token } = mintGrant(facts, { key: grantKeys.signing, now });
    const [version, kid, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<string, unknown>),
        remainingBytes: 10 ** 12,
      }),
    ).toString('base64url');

    expect(verifyAt([version, kid, forged, signature].join('.'))).toEqual({ ok: false, reason: 'signature' });
    expect(verifyAt([version, 'grant-9-0000000000000000', payload, signature].join('.')).ok).toBe(false);
    expect(verifyAt('not-a-grant')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAt('')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('should refuse a grant whose payload is missing a fact the worker needs', () => {
    const { project: _dropped, ...partial } = facts;
    const { token } = mintGrant(partial as StorageGrantFacts, { key: grantKeys.signing, now });

    expect(verifyAt(token)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('should forget a request id once the replay window has passed', () => {
    let clock = now;
    const replay = new ReplayGuard({ now: () => clock, windowMilliseconds: 120_000 });

    expect(replay.claim('a'.repeat(32))).toBe(true);
    clock += 119_000;
    expect(replay.claim('a'.repeat(32))).toBe(false);
    clock += 2000;
    expect(replay.claim('a'.repeat(32))).toBe(true);
  });
});

const receiptFacts: StorageReceiptFacts = {
  rid: 'b'.repeat(32),
  kind: 'commit',
  owner: 'user-owner',
  project: 'proj-1',
  generation: 4,
  incarnation: 'c'.repeat(32),
  manifestSha256: 'd'.repeat(64),
  movedRefs: [{ ref: 'refs/heads/main', before: 'e'.repeat(40), after: 'f'.repeat(40) }],
  materializedTags: [],
  reachableLfsOids: ['0'.repeat(64)],
};

describe('storage receipt (DC1, W9 Finding 2)', () => {
  it('should verify a receipt it signed and hand back every fact', () => {
    const token = signReceipt(receiptFacts, { key: receiptKeys.signing, now });
    const verified = verifyReceipt(token, { keys: receiptKeys.verifying, now });

    expect(verified).toEqual({
      ok: true,
      receipt: { ...receiptFacts, v: receiptContractVersion, kid: 'receipt-1-3ba45a8542d7d595', iat: now / 1000 },
    });
  });

  it('should refuse a receipt signed with the grant key, which the API holds and storage never does', () => {
    const misuse = parseSigningKey(
      JSON.stringify({
        kid: 'receipt-1-3ba45a8542d7d595',
        alg: 'Ed25519',
        privateKeyPem: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
      }),
      'TAU_STORAGE_GRANT_SIGNING_KEY',
    );
    const token = signReceipt(receiptFacts, { key: misuse, now });

    expect(verifyReceipt(token, { keys: receiptKeys.verifying, now })).toEqual({ ok: false, reason: 'signature' });
  });

  it('should refuse a receipt from the future or older than its acceptance window', () => {
    const ahead = signReceipt(receiptFacts, { key: receiptKeys.signing, now: now + 31_000 });
    const stale = signReceipt(receiptFacts, { key: receiptKeys.signing, now: now - 601_000 });

    expect(verifyReceipt(ahead, { keys: receiptKeys.verifying, now })).toEqual({ ok: false, reason: 'iat_skew' });
    expect(verifyReceipt(stale, { keys: receiptKeys.verifying, now })).toEqual({ ok: false, reason: 'expired' });
  });

  it('should refuse a receipt whose digest is not a SHA-256', () => {
    const token = signReceipt({ ...receiptFacts, manifestSha256: 'nope' }, { key: receiptKeys.signing, now });

    expect(verifyReceipt(token, { keys: receiptKeys.verifying, now })).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('contract versions across a mixed fleet (FR12)', () => {
  it('should let API N talk to storage N-1 and the converse while the signer emits the older version', () => {
    const replay = new ReplayGuard({ now: () => now });
    /* Storage N-1 verifies at N-1; API N, during a rollout, emits N-1 (verifier first). */
    const fromApiN = mintGrant(facts, { key: grantKeys.signing, now, version: 1 }).token;
    expect(verifyAt(fromApiN, { version: 1, replay }).ok).toBe(true);
    /* Storage N verifies at N; API N-1 still emits N-1. */
    const fromApiPrevious = mintGrant(facts, { key: grantKeys.signing, now, version: 1 }).token;
    expect(verifyAt(fromApiPrevious, { version: 2, replay }).ok).toBe(true);

    /* Receipts: API N verifies storage N-1's and storage N's. */
    for (const version of [1, 2]) {
      const token = signReceipt(receiptFacts, { key: receiptKeys.signing, now, version });
      expect(verifyReceipt(token, { keys: receiptKeys.verifying, now, version: 2 }).ok).toBe(true);
    }
  });

  it('should hold this build at contract version 1 for grants and receipts', () => {
    expect(grantContractVersion).toBe(1);
    expect(receiptContractVersion).toBe(1);
  });
});

describe('key configuration (secrets register § 3a)', () => {
  it('should read a verifier list of one or two keys and refuse anything else without echoing it', () => {
    const second = pair('grant-2-1111111111111111');
    const both = parsePublicKeys(
      JSON.stringify([
        { kid: 'grant-1-0315d27631832128', alg: 'Ed25519', publicKeyPem: grantKeys.publicPem },
        { kid: 'grant-2-1111111111111111', alg: 'Ed25519', publicKeyPem: second.publicPem },
      ]),
      'TAU_STORAGE_GRANT_PUBLIC_KEYS',
    );

    expect([...both.keys()]).toEqual(['grant-1-0315d27631832128', 'grant-2-1111111111111111']);
    for (const raw of [
      '[]',
      'not json',
      JSON.stringify([{ kid: 'k', alg: 'RS256', publicKeyPem: grantKeys.publicPem }]),
      JSON.stringify([
        { kid: 'k', alg: 'Ed25519', publicKeyPem: grantKeys.publicPem },
        { kid: 'k', alg: 'Ed25519', publicKeyPem: grantKeys.publicPem },
      ]),
    ]) {
      expect(() => parsePublicKeys(raw, 'TAU_STORAGE_GRANT_PUBLIC_KEYS')).toThrow(/^TAU_STORAGE_GRANT_PUBLIC_KEYS /u);
    }
  });

  it('should refuse a signing key that is not Ed25519 and never put the key material in the error', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    let message = '';
    try {
      parseSigningKey(
        JSON.stringify({ kid: 'grant-1-x', alg: 'Ed25519', privateKeyPem: pem }),
        'TAU_STORAGE_GRANT_SIGNING_KEY',
      );
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/^TAU_STORAGE_GRANT_SIGNING_KEY /u);
    expect(message).not.toContain('PRIVATE KEY');
    expect(message).not.toContain(pem.split('\n')[1] ?? 'unreachable');
  });
});

describe('receipt prefix framing (DC1 review S8)', () => {
  /** Writes `bytes` one chunk of `size` at a time, so the reader sees every split. */
  const chunked = (bytes: Uint8Array<ArrayBuffer>, size: number): PassThrough => {
    const stream = new PassThrough();
    for (let offset = 0; offset < bytes.byteLength; offset += size) {
      stream.write(bytes.subarray(offset, offset + size));
    }
    stream.end();
    return stream;
  };

  it('should read a large receipt delivered a few bytes at a time and leave the body behind it', async () => {
    const receipt = 'r'.repeat(256 * 1024);
    const body = Buffer.from('git bytes');
    const stream = chunked(Buffer.concat([encodeReceiptPrefix(receipt), body]), 7);

    expect(await readReceiptPrefix(stream)).toBe(receipt);
    const rest: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of stream) {
      rest.push(chunk as Uint8Array<ArrayBuffer>);
    }
    expect(Buffer.concat(rest).toString()).toBe('git bytes');
  });

  it('should read an empty prefix split across its newline as no receipt', async () => {
    expect(await readReceiptPrefix(chunked(encodeReceiptPrefix(undefined), 1))).toBeUndefined();
  });

  it('should refuse a length line that never ends', async () => {
    await expect(readReceiptPrefix(chunked(Buffer.from('1'.repeat(64)), 3))).rejects.toThrow(/malformed/u);
  });
});
