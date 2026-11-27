/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Controller, Get, HttpCode, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthSession, AuthUser } from '@taucad/api-auth';
import { RequireWebSession, UseAuth, User } from '@taucad/api-auth';
import { AccountService } from '#api/account/account.service.js';
import type { DesktopSignIn } from '#api/account/account.service.js';

type AuthenticatedRequest = FastifyRequest & { session: { session: AuthSession; user: AuthUser } };

/** What `GET /v1/auth/get-session` answers, without the session's token: the shape `useSession` reads. */
export type AccountSession = {
  readonly session: Omit<AuthSession, 'token'> & { readonly token: '' };
  readonly user: AuthUser;
};

@UseAuth()
@Controller({ path: 'account', version: '1' })
export class AccountController {
  public constructor(private readonly accountService: AccountService) {}

  /**
   * Who is signed in, for a web session or Tau Desktop's access token alike (Principal ruling P2): Tau Desktop reads
   * its identity here, because no Better Auth route accepts its token.
   */
  @Get('session')
  public session(@Req() request: AuthenticatedRequest): AccountSession {
    const { session, user } = request.session;
    return { session: { ...session, token: '' }, user };
  }

  /** The account's Tau Desktop sign-ins. Web only: managing sign-ins governs the account (ruling D1=A). */
  @Get('desktop-sign-ins')
  @RequireWebSession()
  public async listDesktopSignIns(@User() user: AuthUser): Promise<{ signIns: DesktopSignIn[] }> {
    return { signIns: await this.accountService.listDesktopSignIns(user.id) };
  }

  /** Ends one Tau Desktop sign-in. Web only. */
  @Post('desktop-sign-ins/:signInId/revoke')
  @HttpCode(204)
  @RequireWebSession()
  public async revokeDesktopSignIn(@User() user: AuthUser, @Param('signInId') signInId: string): Promise<void> {
    if (!(await this.accountService.revokeDesktopSignIn(user.id, signInId))) {
      throw new NotFoundException({ code: 'DESKTOP_SIGN_IN_NOT_FOUND', message: 'This sign-in was not found.' });
    }
  }
}
