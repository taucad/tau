import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import type { AuthUser } from '#auth/auth.type.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import {
  TelemetryPurposesQueryDto,
  UpdateTelemetryPurposesDto,
} from '#api/telemetry-purposes/telemetry-purpose.dto.js';
import type { EffectiveTelemetryPurposes } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

@UseAuth()
@Controller({ path: 'telemetry-purposes', version: '1' })
export class TelemetryPurposeController {
  public constructor(private readonly telemetryPurposeService: TelemetryPurposeService) {}

  /**
   * The effective agent-observability purposes for the current principal.
   *
   * The answer is always the server's, never the client's interpretation of
   * missing fields: an older client that does not know a purpose simply does
   * not display it, and nothing it omits reads as consent.
   */
  @Get()
  public async getEffectivePurposes(
    @User() user: AuthUser,
    @Query() query: TelemetryPurposesQueryDto,
  ): Promise<EffectiveTelemetryPurposes> {
    return this.telemetryPurposeService.getEffectivePurposes(user.id, query.projectId);
  }

  /** Record the decisions the principal took against the notice they were shown. */
  @Put()
  public async recordDecisions(
    @User() user: AuthUser,
    @Body() body: UpdateTelemetryPurposesDto,
  ): Promise<EffectiveTelemetryPurposes> {
    return this.telemetryPurposeService.recordDecisions(user.id, body);
  }
}
