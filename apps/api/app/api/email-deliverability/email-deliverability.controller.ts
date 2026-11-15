import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '@taucad/api-auth';
import { UseAuth, User } from '@taucad/api-auth';
import { EmailDeliverabilityService } from '@taucad/api-email';

/** Whether mail to the caller's own address is expected to arrive. */
export type EmailDeliverability = {
  readonly deliverable: boolean;
};

/**
 * The signed-in user's own email deliverability (email bounce blueprint R11), read by the settings banner.
 *
 * Only the caller's own address, and only behind a session: sign-up, sign-in and reset answer every
 * address the same way, so an unauthenticated request learns nothing about whether an address bounced.
 */
@UseAuth()
@Controller({ path: 'email', version: '1' })
export class EmailDeliverabilityController {
  public constructor(private readonly deliverability: EmailDeliverabilityService) {}

  @Get('deliverability')
  public async getOwnDeliverability(@User() user: AuthUser): Promise<EmailDeliverability> {
    const state = await this.deliverability.stateOf(user.email);
    return { deliverable: state === undefined };
  }
}
