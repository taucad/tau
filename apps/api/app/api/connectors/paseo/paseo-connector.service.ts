import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { parseConnectionOfferFromUrl } from '@getpaseo/protocol/connection-offer';
import type { ConnectionOffer } from '@getpaseo/protocol/connection-offer';
import { parseHostPort } from '@getpaseo/protocol/daemon-endpoints';
import type { Environment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import * as schema from '#database/schema.js';
import {
  decryptPaseoConnectionSecret,
  encryptPaseoConnectionSecret,
} from '#api/connectors/paseo/paseo-connector.crypto.js';
import type {
  PaseoConnectionOffer,
  PaseoPairRequest,
  PaseoPublicConnection,
} from '#api/connectors/paseo/paseo-connector.dto.js';

type ConnectionRow = typeof schema.paseoConnection.$inferSelect;

type StoredSecret = Readonly<{
  offer: ConnectionOffer;
  password?: string;
}>;

const connectionId = (): string => `pso_${randomUUID().replaceAll('-', '')}`;

export const parsePaseoConnectionOffer = (raw: string): ConnectionOffer => {
  const offer = parseConnectionOfferFromUrl(raw);
  if (!offer) {
    throw new TypeError('A Paseo relay pairing link is required.');
  }
  const endpoint = parseHostPort(offer.relay.endpoint);
  const decodedKey = Buffer.from(offer.daemonPublicKeyB64, 'base64');
  if (
    decodedKey.length !== 32 ||
    decodedKey.toString('base64') !== offer.daemonPublicKeyB64 ||
    offer.serverId.length > 256
  ) {
    throw new TypeError('Invalid Paseo pairing offer identity.');
  }
  return {
    ...offer,
    relay: {
      endpoint: endpoint.isIpv6 ? `[${endpoint.host}]:${endpoint.port}` : `${endpoint.host}:${endpoint.port}`,
      ...(offer.relay.useTls === undefined ? {} : { useTls: offer.relay.useTls }),
    },
  };
};

export const assertPaseoConnectionOfferSecurity = (
  offer: ConnectionOffer,
  environment: Environment['NODE_ENV'],
): void => {
  const endpoint = parseHostPort(offer.relay.endpoint);
  const useTls = offer.relay.useTls ?? endpoint.port === 443;
  if (!useTls && environment === 'production') {
    throw new TypeError('Plaintext Paseo relay transport is disabled in production.');
  }
};

const publicConnection = (row: ConnectionRow): PaseoPublicConnection => ({
  id: row.id,
  label: row.label,
  serverId: row.serverId,
  relayEndpoint: row.relayEndpoint,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * The Paseo connection **directory** (SP-10 / charter X3).
 *
 * The daemon session itself lives in the page: `@getpaseo/client` is
 * browser-native, so a Paseo turn is E2EE browser↔relay↔daemon with the Tau API
 * out of the data path entirely. What is left here is a directory: the label,
 * the daemon identity, the relay endpoint, the AES-256-GCM-encrypted pairing
 * offer at rest (so a second device can restore the connection), and
 * revocation. Live connection state — connected/last error/agent list — is
 * known only to the client that holds the socket and is therefore no longer
 * part of the API's contract.
 *
 * Server-side offer validation stays (`parsePaseoConnectionOffer` +
 * `assertPaseoConnectionOfferSecurity`): a stored pairing descriptor that
 * pointed at a plaintext relay would still be handed to a browser later.
 */
@Injectable()
export class PaseoConnectorService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  public async pair(ownerId: string, request: PaseoPairRequest): Promise<PaseoPublicConnection> {
    let offer: ConnectionOffer;
    try {
      offer = parsePaseoConnectionOffer(request.offer);
      assertPaseoConnectionOfferSecurity(offer, this.config.get('NODE_ENV', { infer: true }));
    } catch {
      throw new BadRequestException('Invalid or insecure Paseo pairing offer.');
    }
    const secret: StoredSecret = { offer, ...(request.password ? { password: request.password } : {}) };

    const now = new Date();
    const row = await this.databaseService.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${ownerId}:${offer.serverId}`}, 0))`,
      );
      const existingRows = await transaction
        .select()
        .from(schema.paseoConnection)
        .where(
          and(
            eq(schema.paseoConnection.ownerId, ownerId),
            eq(schema.paseoConnection.serverId, offer.serverId),
            isNull(schema.paseoConnection.revokedAt),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      const encrypted = this.encrypt(secret);
      if (existing) {
        const updatedRows = await transaction
          .update(schema.paseoConnection)
          .set({
            label: request.label ?? existing.label,
            relayEndpoint: offer.relay.endpoint,
            secretCiphertext: encrypted,
            updatedAt: now,
          })
          .where(eq(schema.paseoConnection.id, existing.id))
          .returning();
        return updatedRows[0]!;
      }
      const insertedRows = await transaction
        .insert(schema.paseoConnection)
        .values({
          id: connectionId(),
          ownerId,
          label: request.label ?? offer.serverId,
          serverId: offer.serverId,
          relayEndpoint: offer.relay.endpoint,
          secretCiphertext: encrypted,
        })
        .returning();
      return insertedRows[0]!;
    });
    return publicConnection(row);
  }

  public async list(ownerId: string): Promise<{ connections: PaseoPublicConnection[] }> {
    const rows = await this.databaseService.database
      .select()
      .from(schema.paseoConnection)
      .where(and(eq(schema.paseoConnection.ownerId, ownerId), isNull(schema.paseoConnection.revokedAt)))
      .orderBy(asc(schema.paseoConnection.createdAt));
    return { connections: rows.map((row) => publicConnection(row)) };
  }

  /**
   * Releases the pairing material to its owner so the browser can open the
   * E2EE session itself. A directory operation, never the data path: it is
   * owner-scoped, POST-only (never a cacheable GET), and the response is the
   * same material the user pasted in.
   */
  public async offer(ownerId: string, id: string): Promise<PaseoConnectionOffer> {
    const row = await this.requireOwnedRow(ownerId, id);
    const secret = this.decrypt(row.secretCiphertext);
    return { offer: secret.offer, ...(secret.password === undefined ? {} : { password: secret.password }) };
  }

  public async revoke(ownerId: string, id: string): Promise<void> {
    const row = await this.requireOwnedRow(ownerId, id);
    await this.databaseService.database
      .update(schema.paseoConnection)
      .set({ revokedAt: new Date(), secretCiphertext: '', updatedAt: new Date() })
      .where(and(eq(schema.paseoConnection.id, row.id), eq(schema.paseoConnection.ownerId, ownerId)));
  }

  private async requireOwnedRow(ownerId: string, id: string): Promise<ConnectionRow> {
    const rows = await this.databaseService.database
      .select()
      .from(schema.paseoConnection)
      .where(
        and(
          eq(schema.paseoConnection.id, id),
          eq(schema.paseoConnection.ownerId, ownerId),
          isNull(schema.paseoConnection.revokedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Paseo connection not found.');
    }
    return row;
  }

  private encrypt(secret: StoredSecret): string {
    return encryptPaseoConnectionSecret(JSON.stringify(secret), this.config.get('AUTH_SECRET', { infer: true }));
  }

  private decrypt(ciphertext: string): StoredSecret {
    const decoded = decryptPaseoConnectionSecret(ciphertext, this.config.get('AUTH_SECRET', { infer: true }));
    const value: unknown = JSON.parse(decoded);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Invalid encrypted Paseo connection secret.');
    }
    const record = value as Record<string, unknown>;
    const { password } = record;
    if (password !== undefined && (typeof password !== 'string' || password.length === 0 || password.length > 1024)) {
      throw new TypeError('Invalid encrypted Paseo connection secret.');
    }
    return {
      offer: parsePaseoConnectionOffer(this.offerUrl(record['offer'])),
      ...(typeof password === 'string' ? { password } : {}),
    };
  }

  private offerUrl(offer: unknown): string {
    const serialized: unknown = JSON.stringify(offer);
    if (typeof serialized !== 'string') {
      throw new TypeError('Invalid encrypted Paseo connection secret.');
    }
    const encoded = Buffer.from(serialized, 'utf8').toString('base64url');
    return `https://app.paseo.sh/#offer=${encoded}`;
  }
}
