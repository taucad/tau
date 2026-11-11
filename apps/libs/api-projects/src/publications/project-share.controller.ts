/* oxlint-disable new-cap -- NestJS parameter decorators */
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthGuard, UseAuth, User } from '@taucad/api-auth';
import { ProjectShareEnvelopeDto } from '#publications/publications.dto.js';
import { PublicationsService } from '#publications/publications.service.js';

@Controller({ path: 'projects', version: '1' })
@UseGuards(AuthGuard)
export class ProjectShareController {
  public constructor(private readonly publicationsService: PublicationsService) {}

  @Get(':id/share')
  @UseAuth()
  @ZodSerializerDto(ProjectShareEnvelopeDto)
  public async getProjectShare(
    @Param('id') projectId: string,
    @User('id') ownerId: string,
  ): Promise<ProjectShareEnvelopeDto> {
    return this.publicationsService.getProjectShareEnvelope({ projectId, ownerId });
  }
}
