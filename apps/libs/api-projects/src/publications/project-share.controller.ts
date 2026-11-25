/* oxlint-disable new-cap -- NestJS parameter decorators */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthGuard, OptionalAuth, OptionalUser, UseAuth, User } from '@taucad/api-auth';
import {
  InviteProjectShareAccessDto,
  ProjectShareAccessGrantDto,
  ProjectShareAccessInviteResponseDto,
  ProjectShareDto,
  ProjectShareEnvelopeDto,
  PublicationViewResponseDto,
  UpdateProjectShareDto,
} from '#publications/publications.dto.js';
import { PublicationsService } from '#publications/publications.service.js';

/**
 * The owner's side of a project's one stable cloud link (stable cloud link
 * blueprint D1): read it, change who can open it, stop sharing, and manage the
 * invited people. Every route needs the project's owner.
 */
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

  @Patch(':id/share')
  @UseAuth()
  @ZodSerializerDto(ProjectShareDto)
  public async updateProjectShare(
    @Param('id') projectId: string,
    @User('id') ownerId: string,
    @Body() body: UpdateProjectShareDto,
  ): Promise<ProjectShareDto> {
    return this.publicationsService.updateProjectShare({ projectId, ownerId, visibility: body.visibility });
  }

  /** "Stop sharing": on every plan, idempotent. */
  @Delete(':id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseAuth()
  public async stopProjectShare(@Param('id') projectId: string, @User('id') ownerId: string): Promise<void> {
    await this.publicationsService.stopProjectShare({ projectId, ownerId });
  }

  @Post(':id/share/access')
  @HttpCode(HttpStatus.CREATED)
  @UseAuth()
  @ZodSerializerDto(ProjectShareAccessInviteResponseDto)
  public async inviteAccess(
    @Param('id') projectId: string,
    @User('id') ownerId: string,
    @Body() body: InviteProjectShareAccessDto,
  ): Promise<ProjectShareAccessInviteResponseDto> {
    return this.publicationsService.inviteProjectShareAccess({
      projectId,
      ownerId,
      recipientEmail: body.email,
      notifyRecipient: body.notifyRecipient,
    });
  }

  @Delete(':id/share/access/:accessId')
  @UseAuth()
  @ZodSerializerDto(ProjectShareAccessGrantDto)
  public async revokeAccess(
    @Param('id') projectId: string,
    @Param('accessId') accessId: string,
    @User('id') ownerId: string,
  ): Promise<ProjectShareAccessGrantDto> {
    return this.publicationsService.revokeProjectShareAccess({ projectId, ownerId, accessId });
  }
}

/**
 * The viewer's side of a cloud link: `GET /v1/shares/:shareId` answers the
 * version the link shows. Only a link id resolves; an old `pub_…` id is `404`.
 */
@Controller({ path: 'shares', version: '1' })
@UseGuards(AuthGuard)
export class SharesController {
  public constructor(private readonly publicationsService: PublicationsService) {}

  @Get(':shareId')
  @OptionalAuth()
  @ZodSerializerDto(PublicationViewResponseDto)
  public async getShare(
    @Param('shareId') shareId: string,
    @OptionalUser('id') viewerUserId: string | undefined,
  ): Promise<PublicationViewResponseDto> {
    return this.publicationsService.getShareForViewer({ shareId, viewerUserId });
  }
}
