import { createHash, generateKeyPairSync } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import {
  developmentAttestationPublicKeysJson,
  developmentSigningKeyJson,
} from '#forwarding/contract/development-keys.js';
import { parseSigningKey } from '#forwarding/contract/keys.js';
import type { SigningKey } from '#forwarding/contract/keys.js';
import {
  attestationKey,
  attestationRank,
  chunkKey,
  commitBits,
  readAttestation,
  recordKey,
  signAttestation,
  writeAttestation,
} from '#store/attestation.js';
import type { AttestationDraft, CommitEntry } from '#store/attestation.js';
import { parseAttestationPublicKeys, parseAttestationSigningKey } from '#store/attestation-keys.js';
import type { AttestationKeys } from '#store/attestation-keys.js';
import { repositoryLocator } from '#store/locator.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#store/manifest.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/**
 * The attestation format and its signing (contracts § 2): the record key a reader recomputes, the envelope, chunks,
 * the read preference, revocation with re-attested siblings, and the write-once collision check.
 */

const developmentKey = parseSigningKey(developmentSigningKeyJson('attestation'), 'test');

const newPair = (kid: string): { signer: SigningKey; publicKeyPem: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signer: { kid, key: privateKey },
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
};

const keysOf = (
  entries: ReadonlyArray<{
    kid: string;
    publicKeyPem: string;
    revokedAt?: string;
  }>,
): AttestationKeys =>
  parseAttestationPublicKeys(
    JSON.stringify(
      entries.map((entry) => ({
        alg: 'Ed25519',
        notBefore: '2026-11-01T00:00:00.000Z',
        ...entry,
      })),
    ),
  );

const oid = (n: number): string => createHash('sha1').update(String(n)).digest('hex');

const draft = (
  record: string,
  commits: readonly CommitEntry[],
  overrides: Partial<AttestationDraft> = {},
): AttestationDraft => ({
  record,
  kind: 'push',
  origin: 'admission',
  coverage: 'complete',
  basisInputs: { email: 'admission', forge: 'none' },
  refs: [{ ref: 'refs/heads/main', tip: oid(0) }],
  commits,
  ...overrides,
});

const locator = repositoryLocator({
  ownerId: 'owner-a',
  projectId: 'project-a',
});

const firstManifest = (at: Date, anonymous = false) =>
  succeedManifest(
    undefined,
    {
      refs: { 'refs/heads/main': { oid: oid(0) } },
      packs: [],
      committedBy: 'user_a',
      anonymous,
    },
    at,
  );

describe('record key', () => {
  it('should survive decode then encode and ignore the generation', () => {
    const at = new Date('2026-11-27T10:00:00.000Z');
    const manifest = firstManifest(at);
    const record = manifest.pushes.at(-1);
    if (record === undefined) {
      throw new Error('no record');
    }
    const decoded = decodeManifest(encodeManifest(manifest)).pushes.at(-1);
    expect(decoded).toStrictEqual(record);
    expect(recordKey(decoded ?? record)).toBe(recordKey(record));
    expect(recordKey({ ...record, generation: 99 })).toBe(recordKey(record));
    expect(recordKey(firstManifest(at, true).pushes[0] ?? record)).not.toBe(recordKey(record));
    expect(recordKey(firstManifest(new Date(at.getTime() + 1)).pushes[0] ?? record)).not.toBe(recordKey(record));
  });
});

describe('signing and reading', () => {
  const keys = parseAttestationPublicKeys(developmentAttestationPublicKeysJson());

  it('should keep up to 500 commits inline and read them back', async () => {
    const store = createMemoryRepositoryStore();
    const commits: CommitEntry[] = Array.from({ length: 500 }, (_, n) => [oid(n), commitBits.claim, 'admin']);
    const objects = signAttestation(draft('a'.repeat(64), commits), developmentKey);
    expect(objects.map((object) => object.key)).toStrictEqual([
      attestationKey('a'.repeat(64), 'attestation-development', 'admission'),
    ]);
    expect(objects[0]?.body).not.toContain('@');
    expect(await writeAttestation({ store, locator, objects })).toBe('written');

    const read = await readAttestation({
      store,
      locator,
      record: 'a'.repeat(64),
      keys,
    });
    expect(read?.attestation.commits).toMatchObject({ count: 500 });
    expect(read?.commits).toStrictEqual(commits);
    expect(read?.kid).toBe('attestation-development');
  });

  it('should spill more than 500 commits into signed chunks of 2,000 written before the attestation', async () => {
    const store = createMemoryRepositoryStore();
    const record = 'b'.repeat(64);
    const commits: CommitEntry[] = Array.from({ length: 4001 }, (_, n) => [
      oid(n),
      n % 2 === 0 ? commitBits.pseudonymous : 0,
    ]);
    const objects = signAttestation(draft(record, commits), developmentKey);
    expect(objects.map((object) => object.key)).toStrictEqual([
      chunkKey(attestationKey(record, 'attestation-development', 'admission'), 0),
      chunkKey(attestationKey(record, 'attestation-development', 'admission'), 1),
      chunkKey(attestationKey(record, 'attestation-development', 'admission'), 2),
      attestationKey(record, 'attestation-development', 'admission'),
    ]);
    await writeAttestation({ store, locator, objects });

    const read = await readAttestation({ store, locator, record, keys });
    expect(read?.commits).toStrictEqual(commits);
    expect(read?.attestation.commits.inline).toBeUndefined();

    /* A chunk replaced under the same key disqualifies its attestation, and is reported. */
    const tampered = createMemoryRepositoryStore();
    const forged = signAttestation(
      draft(
        record,
        commits.map(([id]) => [id, commitBits.claim, 'admin'] as const),
      ),
      developmentKey,
    );
    for (const object of [forged[0], ...objects.slice(1)]) {
      if (object !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of objects
        await writeAttestation({ store: tampered, locator, objects: [object] });
      }
    }
    const invalid: string[] = [];
    expect(
      await readAttestation({
        store: tampered,
        locator,
        record,
        keys,
        onInvalid: (_, key) => invalid.push(key),
      }),
    ).toBeUndefined();
    expect(invalid).toStrictEqual([chunkKey(attestationKey(record, 'attestation-development', 'admission'), 0)]);
  });

  it('should prefer a complete admission, then repair, then backfill, then failed coverage', async () => {
    const store = createMemoryRepositoryStore();
    const record = 'c'.repeat(64);
    const write = async (overrides: Partial<AttestationDraft>, commits: readonly CommitEntry[]): Promise<void> => {
      await writeAttestation({
        store,
        locator,
        objects: signAttestation(draft(record, commits, overrides), developmentKey),
      });
    };
    await write({ coverage: 'failed' }, []);
    const best = async (): Promise<string | undefined> => {
      const read = await readAttestation({ store, locator, record, keys });
      return read === undefined ? undefined : `${read.attestation.origin}/${read.attestation.coverage}`;
    };
    expect(await best()).toBe('admission/failed');
    await write(
      {
        origin: 'backfill',
        basisInputs: { email: 'current', forge: 'current' },
      },
      [[oid(1), 0]],
    );
    expect(await best()).toBe('backfill/complete');
    await write({ origin: 'repair', basisInputs: { email: 'current', forge: 'current' } }, [[oid(2), 0]]);
    expect(await best()).toBe('repair/complete');
    expect(
      ['admission', 'repair', 'backfill'].flatMap((origin) =>
        (['complete', 'failed'] as const).map((coverage) =>
          attestationRank({ origin: origin as 'admission', coverage }),
        ),
      ),
    ).toStrictEqual([0, 3, 1, 4, 2, 5]);
  });

  it('should refuse an unknown kid and an object copied under another record', async () => {
    const store = createMemoryRepositoryStore();
    const stranger = newPair('stranger-1');
    const record = 'd'.repeat(64);
    await writeAttestation({
      store,
      locator,
      objects: signAttestation(draft(record, []), stranger.signer),
    });
    const reasons: string[] = [];
    expect(
      await readAttestation({
        store,
        locator,
        record,
        keys,
        onInvalid: (reason) => reasons.push(reason),
      }),
    ).toBeUndefined();
    expect(reasons).toStrictEqual(['unknown_kid']);

    const signed = signAttestation(draft(record, []), developmentKey)[0];
    const elsewhere = 'e'.repeat(64);
    await writeAttestation({
      store,
      locator,
      objects: [
        {
          key: attestationKey(elsewhere, 'attestation-development', 'admission'),
          body: signed?.body ?? '',
        },
      ],
    });
    reasons.length = 0;
    expect(
      await readAttestation({
        store,
        locator,
        record: elsewhere,
        keys,
        onInvalid: (reason) => reasons.push(reason),
      }),
    ).toBeUndefined();
    expect(reasons).toStrictEqual(['key_mismatch']);

    /* A backfill object renamed as an admission cannot climb the preference order. */
    const promoted = 'a1'.repeat(32);
    const backfill = signAttestation(draft(promoted, [], { origin: 'backfill' }), developmentKey)[0];
    await writeAttestation({
      store,
      locator,
      objects: [
        {
          key: attestationKey(promoted, 'attestation-development', 'admission'),
          body: backfill?.body ?? '',
        },
      ],
    });
    reasons.length = 0;
    expect(
      await readAttestation({
        store,
        locator,
        record: promoted,
        keys,
        onInvalid: (reason) => reasons.push(reason),
      }),
    ).toBeUndefined();
    expect(reasons).toStrictEqual(['key_mismatch']);
  });

  it('should ignore a revoked kid unless a re-attested sibling under a live kid exists', async () => {
    const store = createMemoryRepositoryStore();
    const old = newPair('attest-1');
    const fresh = newPair('attest-2');
    const record = 'f'.repeat(64);
    const commits: CommitEntry[] = [[oid(7), commitBits.claim, 'admin']];
    await writeAttestation({
      store,
      locator,
      objects: signAttestation(draft(record, commits), old.signer),
    });
    const rotated = keysOf([
      {
        kid: 'attest-1',
        publicKeyPem: old.publicKeyPem,
        revokedAt: '2026-11-20T00:00:00.000Z',
      },
      { kid: 'attest-2', publicKeyPem: fresh.publicKeyPem },
    ]);
    const reasons: string[] = [];
    expect(
      await readAttestation({
        store,
        locator,
        record,
        keys: rotated,
        onInvalid: (reason) => reasons.push(reason),
      }),
    ).toBeUndefined();
    expect(reasons).toStrictEqual(['revoked_kid']);
    /* `reattest` still verifies under the old key. */
    const withRevoked = await readAttestation({
      store,
      locator,
      record,
      keys: rotated,
      includeRevoked: true,
    });
    expect(withRevoked?.kid).toBe('attest-1');

    await writeAttestation({
      store,
      locator,
      objects: signAttestation(
        draft(record, commits, {
          reattestedFrom: {
            kid: 'attest-1',
            b2UploadedAt: '2026-11-10T00:00:00.000Z',
          },
        }),
        fresh.signer,
      ),
    });
    const read = await readAttestation({
      store,
      locator,
      record,
      keys: rotated,
    });
    expect(read?.kid).toBe('attest-2');
    expect(read?.commits).toStrictEqual(commits);
  });
});

describe('write once', () => {
  it('should leave an existing object as it is and report a collision when its bytes differ', async () => {
    const store = createMemoryRepositoryStore();
    const record = '1'.repeat(64);
    const first = signAttestation(draft(record, [[oid(1), 0]]), developmentKey);
    const second = signAttestation(draft(record, [[oid(2), 0]]), developmentKey);
    expect(await writeAttestation({ store, locator, objects: first })).toBe('written');
    /* The same bytes again (a retried write) are not a collision. */
    expect(await writeAttestation({ store, locator, objects: first })).toBe('written');
    expect(await writeAttestation({ store, locator, objects: second })).toBe('collision');
    const stored = await buffer(await store.getObject(locator, first[0]?.key ?? ''));
    expect(stored.toString('utf8')).toBe(first[0]?.body);
  });
});

describe('keys', () => {
  it('should read an unset signer as none and refuse bad values without echoing them', () => {
    expect(parseAttestationSigningKey(undefined)).toBeUndefined();
    expect(parseAttestationSigningKey('')).toBeUndefined();
    expect(() => parseAttestationSigningKey('{"kid":"x","secret":"hunter2"}')).toThrow(
      /^TAU_STORAGE_ATTESTATION_SIGNING_KEY must be JSON/u,
    );
    expect(() => parseAttestationPublicKeys('hunter2')).toThrow('TAU_STORAGE_ATTESTATION_PUBLIC_KEYS is not JSON');
    const pair = newPair('k-1');
    expect(() =>
      keysOf([
        { kid: 'k-1', publicKeyPem: pair.publicKeyPem },
        { kid: 'k-1', publicKeyPem: pair.publicKeyPem },
      ]),
    ).toThrow('names one kid twice');
    expect(() => keysOf([{ kid: 'k.1', publicKeyPem: pair.publicKeyPem }])).toThrow(/must be a JSON array/u);
    /* More than two kids: rotation keeps retired ones verify-only. */
    expect(
      keysOf(
        ['a', 'b', 'c'].map((kid) => ({
          kid,
          publicKeyPem: newPair(kid).publicKeyPem,
        })),
      ).size,
    ).toBe(3);
  });
});
