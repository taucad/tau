import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AuthUser } from '@taucad/api-auth';
import { UseAuth, User } from '@taucad/api-auth';
import type { PrivacyPreferences } from '#api/privacy/privacy.schema.js';
import { UpdatePrivacyPreferencesDto } from '#api/privacy/privacy.dto.js';
import { PrivacyService } from '#api/privacy/privacy.service.js';

@UseAuth()
@Controller({ path: 'privacy', version: '1' })
export class PrivacyController {
  public constructor(private readonly privacyService: PrivacyService) {}

  /**
   * Get privacy preferences for the current user
   */
  @Get()
  public async getPrivacyPreferences(@User() user: AuthUser): Promise<PrivacyPreferences> {
    return this.privacyService.getPrivacyPreferences(user.id);
  }

  /**
   * Update privacy preferences for the current user
   */
  @Patch()
  public async updatePrivacyPreferences(
    @User() user: AuthUser,
    @Body() body: UpdatePrivacyPreferencesDto,
  ): Promise<PrivacyPreferences> {
    return this.privacyService.updatePrivacyPreferences(user.id, body);
  }
}
