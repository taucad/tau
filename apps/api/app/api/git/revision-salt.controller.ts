/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHmac } from 'node:crypto';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';

/** Domain separation, so this HMAC never equals another use of the same secret. */
const saltLabel = 'tau-revision-pseudonym-salt/v1';

/** A workspace slug is a directory name; anything longer is not one. */
const maximumWorkspaceLength = 255;

/**
 * The anonymous-revision salt (EQ10 option (a), D22, L6-F10/F11).
 *
 * An anonymous revision's pseudonym used to be a hash of the workspace and the
 * user id, and the user id is in every attributed commit's trailer, so anyone
 * who could clone could recompute it. The pseudonym now derives from this salt,
 * which is served only to the signed-in account it belongs to, cached in host
 * state and never written to the tree — so nothing Tau records lets it be
 * recomputed.
 *
 * One salt per `(workspace, account)`: the same person gets one pseudonym in a
 * workspace on every device, and a different one in every other workspace.
 * Derived rather than stored, so there is no table and no migration: an HMAC of
 * the pair under the API's own secret is stable, unguessable without that
 * secret, and the same answer on every worker.
 *
 * ponytail: rotating `AUTH_SECRET` changes every salt, so revisions minted
 * afterwards carry a new pseudonym for the same person. Store a random salt per
 * pair the day that rotation has to preserve pseudonyms.
 */
@Controller({ path: 'revisions', version: '1' })
@UseAuth()
export class RevisionSaltController {
  readonly #secret: string;

  public constructor(configService: ConfigService<Environment, true>) {
    this.#secret = configService.get('AUTH_SECRET', { infer: true });
  }

  /**
   * This account's salt for one workspace.
   *
   * @param workspace - The workspace slug the client records revisions under.
   * @param userId - The authenticated caller; never a request field.
   * @returns The salt, as 64 hexadecimal characters.
   * @throws BadRequestException When no workspace is named.
   */
  @Get('salt')
  public salt(@Query('workspace') workspace: string | undefined, @User('id') userId: string): { salt: string } {
    if (workspace === undefined || workspace === '' || workspace.length > maximumWorkspaceLength) {
      throw new BadRequestException({ code: 'REVISION_SALT_WORKSPACE_REQUIRED', message: 'Name the workspace.' });
    }
    return {
      salt: createHmac('sha256', this.#secret).update(`${saltLabel}\0${workspace}\0${userId}`).digest('hex'),
    };
  }
}
