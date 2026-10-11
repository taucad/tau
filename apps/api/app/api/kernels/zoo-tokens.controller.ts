/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ZooTokenService } from '#api/kernels/zoo-token.service.js';
import type { ZooToken } from '#api/kernels/zoo-token.service.js';

/**
 * Mint the Zoo-scoped token a trusted host hands its kernel process (see {@link ZooTokenService}).
 *
 * The caller proves its session the usual way (cookie or bearer); what comes
 * back opens `/v1/kernels/zoo` as that user for half an hour, in a
 * `tau-zoo-token` upgrade header, and nothing else.
 */
@Controller({ path: 'kernels/zoo/tokens', version: '1' })
@UseAuth()
export class ZooTokensController {
  public constructor(private readonly tokens: ZooTokenService) {}

  /**
   * One token for the signed-in caller.
   *
   * @param userId - The authenticated caller; never a request field.
   * @returns The token and its expiry.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('cache-control', 'no-store')
  public mint(@User('id') userId: string): ZooToken {
    return this.tokens.mint(userId);
  }
}
