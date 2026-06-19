/* oxlint-disable new-cap -- NestJS parameter decorators */
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ProjectShareEnvelopeDto } from '#api/publications/publications.dto.js';
import { PublicationsService } from '#api/publications/publications.service.js';

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
