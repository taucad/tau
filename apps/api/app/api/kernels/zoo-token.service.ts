/* oxlint-disable @typescript-eslint/consistent-type-imports -- NestJS DI metadata needs runtime class imports */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Environment } from '#config/environment.config.js';

/** Format version; a verifier refuses every other prefix. */
const tokenPrefix = 'zt1';
/** Domain separation: this key never equals another use of `AUTH_SECRET`. */
const keyLabel = 'tau-zoo-token/v1';
/** Seconds. Hosts refresh well inside it, so a missed refresh never strands a run. */
const tokenLifetime = 30 * 60;

const claimsSchema = z.strictObject({
  sub: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});

/** A minted Zoo-scoped token and when it stops opening the proxy. */
export type ZooToken = { readonly token: string; readonly expiresAt: string };

/**
 * The Zoo-scoped token: a short-lived credential that opens the Zoo proxy as
 * one user and nothing else.
 *
 * Desktop kernel utilities and `tau serve` children run project JavaScript in
 * the same realm as the kernel, so they never hold the session that signed the
 * user in; the trusted process holding that session mints one of these and
 * hands it over instead (`docs/research/zoo-kernel-local-hosts-blueprint.md`).
 * Stateless: `zt1.<claims>.<HMAC-SHA256>` under a key derived from
 * `AUTH_SECRET`, so every worker verifies it without a table.
 *
 * ponytail: no revocation list — a token outlives a sign-out by at most
 * {@link tokenLifetime}, and it can only open Zoo sessions, which project code
 * can already cause by writing a `.kcl` file. Store a revocable token the day a
 * Zoo session costs more than that.
 */
@Injectable()
export class ZooTokenService {
  readonly #key: Uint8Array<ArrayBuffer>;

  public constructor(configService: ConfigService<Environment, true>) {
    this.#key = new Uint8Array(
      hkdfSync('sha256', configService.get('AUTH_SECRET', { infer: true }), new Uint8Array(), keyLabel, 32),
    );
  }

  /**
   * Mint a token for one user.
   *
   * @param userId - The authenticated caller.
   * @param now - Milliseconds since the epoch; injected for tests.
   * @returns The token and its expiry.
   */
  public mint(userId: string, now = Date.now()): ZooToken {
    const iat = Math.floor(now / 1000);
    const exp = iat + tokenLifetime;
    const claims = Buffer.from(JSON.stringify({ sub: userId, iat, exp })).toString('base64url');
    return {
      token: `${tokenPrefix}.${claims}.${this.#sign(claims)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /**
   * The user a token names, if it is genuine and unexpired.
   *
   * @param token - The presented `tau-zoo-token` value.
   * @param now - Milliseconds since the epoch; injected for tests.
   * @returns The user id, or `undefined` for any token this service did not mint or that has expired.
   */
  public verify(token: string, now = Date.now()): string | undefined {
    const [prefix, claims, signature, ...rest] = token.split('.');
    if (prefix !== tokenPrefix || claims === undefined || signature === undefined || rest.length > 0) {
      return undefined;
    }
    const expected = Buffer.from(this.#sign(claims));
    const presented = Buffer.from(signature);
    if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
      return undefined;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    const parsed = claimsSchema.safeParse(decoded);
    return parsed.success && parsed.data.exp > Math.floor(now / 1000) ? parsed.data.sub : undefined;
  }

  #sign(claims: string): string {
    return createHmac('sha256', this.#key).update(`${tokenPrefix}.${claims}`).digest('base64url');
  }
}
