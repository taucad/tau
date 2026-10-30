/* oxlint-disable new-cap -- NestJS parameter decorators are factories */
import { Body, Controller, Get, NotFoundException, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '#auth/auth.type.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { CloudHost, CloudHostEvidenceGuard } from '#api/hosts/cloud-host-evidence.guard.js';
import type { CloudHostReporter } from '#api/hosts/cloud-host-evidence.guard.js';
import {
  TelemetryPurposesQueryDto,
  UpdateTelemetryPurposesDto,
} from '#api/telemetry-purposes/telemetry-purpose.dto.js';
import type { EffectiveTelemetryPurposes } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

@Controller({ path: 'telemetry-purposes', version: '1' })
export class TelemetryPurposeController {
  public constructor(private readonly telemetryPurposeService: TelemetryPurposeService) {}

  /**
   * The effective agent-observability purposes for the current principal.
   *
   * The answer is always the server's, never the client's interpretation of
   * missing fields: an older client that does not know a purpose simply does
   * not display it, and nothing it omits reads as consent.
   *
   * A cloud host reads its owner's answer for its own project and no other:
   * a sibling project's existence is not its credential's to learn.
   */
  @Get()
  @UseGuards(CloudHostEvidenceGuard)
  public async getEffectivePurposes(
    @User() user: AuthUser,
    @Query() query: TelemetryPurposesQueryDto,
    @CloudHost() host: CloudHostReporter | undefined,
  ): Promise<EffectiveTelemetryPurposes> {
    if (host !== undefined && query.projectId !== host.projectId) {
      throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    }
    return this.telemetryPurposeService.getEffectivePurposes(user.id, query.projectId);
  }

  /** Record the decisions the principal took against the notice they were shown. A session only: a host never decides. */
  @Put()
  @UseAuth()
  public async recordDecisions(
    @User() user: AuthUser,
    @Body() body: UpdateTelemetryPurposesDto,
  ): Promise<EffectiveTelemetryPurposes> {
    return this.telemetryPurposeService.recordDecisions(user.id, body);
  }
}
