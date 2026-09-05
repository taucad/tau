import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '#database/database.service.js';
import type { Environment } from '#config/environment.config.js';
import {
  PaseoConnectorService,
  assertPaseoConnectionOfferSecurity,
  parsePaseoConnectionOffer,
} from '#api/connectors/paseo/paseo-connector.service.js';
import {
  decryptPaseoConnectionSecret,
  encryptPaseoConnectionSecret,
} from '#api/connectors/paseo/paseo-connector.crypto.js';
import { paseoConnectionSchema } from '#api/connectors/paseo/paseo-connector.dto.js';

const authSecret = 'a'.repeat(32);

const pairingUrl = (
  input: {
    endpoint?: string;
    useTls?: boolean;
    key?: string;
  } = {},
): string => {
  const payload = {
    v: 2,
    serverId: 'server-test',
    daemonPublicKeyB64: input.key ?? Buffer.alloc(32, 7).toString('base64'),
    relay: {
      endpoint: input.endpoint ?? 'relay.example.test:443',
      ...(input.useTls === undefined ? {} : { useTls: input.useTls }),
    },
  };
  return `https://app.paseo.sh/#offer=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
};

const config = {
  get: (key: string) => (key === 'AUTH_SECRET' ? authSecret : 'test'),
} as unknown as ConfigService<Environment, true>;

const storedRow = (overrides: Record<string, unknown> = {}) => {
  const now = new Date(0);
  return {
    id: 'pso_1',
    ownerId: 'owner_1',
    label: 'Workstation',
    serverId: 'server-test',
    relayEndpoint: 'relay.example.test:443',
    secretCiphertext: encryptPaseoConnectionSecret(
      JSON.stringify({ offer: parsePaseoConnectionOffer(pairingUrl()), password: 'daemon-password' }),
      authSecret,
    ),
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    ...overrides,
  };
};

/** A `select().from().where().limit()` chain that answers with `rows`. */
const selectOnly = (rows: readonly unknown[], limit = vi.fn().mockResolvedValue(rows)) => ({
  databaseService: {
    database: { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) },
  } as unknown as DatabaseService,
  limit,
});

describe('Paseo connector security boundary', () => {
  it('uses an authenticated encrypted envelope with a Paseo-specific key derivation context', () => {
    const ciphertext = encryptPaseoConnectionSecret('pairing-secret', authSecret);
    expect(ciphertext).not.toContain('pairing-secret');
    expect(decryptPaseoConnectionSecret(ciphertext, authSecret)).toBe('pairing-secret');
    expect(() => decryptPaseoConnectionSecret(ciphertext, 'b'.repeat(32))).toThrow();
  });

  it('rejects a decrypted secret whose envelope fields do not match the stored contract', () => {
    const service = new PaseoConnectorService({} as unknown as DatabaseService, config);
    const ciphertext = encryptPaseoConnectionSecret(
      JSON.stringify({ offer: parsePaseoConnectionOffer(pairingUrl()), password: { leaked: true } }),
      authSecret,
    );

    expect(() => (service as unknown as { decrypt: (value: string) => unknown }).decrypt(ciphertext)).toThrow(
      'Invalid encrypted Paseo connection secret',
    );
  });

  it('parses the upstream versioned offer and enforces a canonical 32-byte daemon key', () => {
    expect(parsePaseoConnectionOffer(pairingUrl())).toMatchObject({
      v: 2,
      serverId: 'server-test',
      relay: { endpoint: 'relay.example.test:443' },
    });
    expect(() => parsePaseoConnectionOffer(pairingUrl({ key: Buffer.alloc(31).toString('base64') }))).toThrow(
      'identity',
    );
    expect(() => parsePaseoConnectionOffer(pairingUrl({ key: 'not-base64' }))).toThrow('identity');
  });

  it('rejects plaintext relay transport in production but permits explicit local development', () => {
    const offer = parsePaseoConnectionOffer(pairingUrl({ endpoint: 'localhost:6768', useTls: false }));
    expect(() => {
      assertPaseoConnectionOfferSecurity(offer, 'production');
    }).toThrow('disabled in production');
    expect(() => {
      assertPaseoConnectionOfferSecurity(offer, 'development');
    }).not.toThrow();
  });

  it('does not serialize pairing material in the public connection contract', () => {
    const result = paseoConnectionSchema.parse({
      id: 'pso_1',
      label: 'Workstation',
      serverId: 'server-test',
      relayEndpoint: 'relay.example.test:443',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    expect(result).not.toHaveProperty('offer');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('daemonPublicKeyB64');
    expect(result).not.toHaveProperty('connected');
  });
});

describe('Paseo connector as a directory (SP-10)', () => {
  it('pairs without opening a daemon session', async () => {
    const insertedRows = [storedRow()];
    const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        execute: vi.fn().mockResolvedValue(undefined),
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: () => ({ returning: async () => insertedRows }) }),
      }),
    );
    const service = new PaseoConnectorService({ database: { transaction } } as unknown as DatabaseService, config);

    await expect(service.pair('owner_1', { offer: pairingUrl(), label: 'Workstation' })).resolves.toMatchObject({
      id: 'pso_1',
      serverId: 'server-test',
      relayEndpoint: 'relay.example.test:443',
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('refuses an insecure offer before any row is written', async () => {
    const transaction = vi.fn();
    const service = new PaseoConnectorService(
      { database: { transaction } } as unknown as DatabaseService,
      { get: (key: string) => (key === 'AUTH_SECRET' ? authSecret : 'production') } as unknown as ConfigService<
        Environment,
        true
      >,
    );

    await expect(
      service.pair('owner_1', { offer: pairingUrl({ endpoint: 'localhost:6768', useTls: false }) }),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns the decrypted offer and password to the owning user', async () => {
    const { databaseService } = selectOnly([storedRow()]);
    const service = new PaseoConnectorService(databaseService, config);

    await expect(service.offer('owner_1', 'pso_1')).resolves.toEqual({
      offer: parsePaseoConnectionOffer(pairingUrl()),
      password: 'daemon-password',
    });
  });

  it('omits an absent password rather than emitting a null', async () => {
    const secretCiphertext = encryptPaseoConnectionSecret(
      JSON.stringify({ offer: parsePaseoConnectionOffer(pairingUrl()) }),
      authSecret,
    );
    const { databaseService } = selectOnly([storedRow({ secretCiphertext })]);
    const service = new PaseoConnectorService(databaseService, config);

    await expect(service.offer('owner_1', 'pso_1')).resolves.not.toHaveProperty('password');
  });

  it('checks row ownership before releasing pairing material', async () => {
    const { databaseService, limit } = selectOnly([]);
    const service = new PaseoConnectorService(databaseService, config);

    await expect(service.offer('different-owner', 'pso_1')).rejects.toMatchObject({ status: 404 });
    expect(limit).toHaveBeenCalledOnce();
  });
});
