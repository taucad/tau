/* oxlint-disable new-cap -- NestJS parameter decorators */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { OptionalAuth, OptionalUser, UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { PublishMultipart } from '#api/publications/publish-multipart.decorator.js';
import {
  InvitePublicationAccessDto,
  PublicationAccessGrantDto,
  PublicationAccessListDto,
  PublicationViewResponseDto,
  PublicationVisibilityUpdateDto,
  PublishResponseDto,
  PublishUploadDto,
  UpdatePublicationVisibilityDto,
} from '#api/publications/publications.dto.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import { ViewerIdentity } from '#api/publications/viewer-identity.decorator.js';
import { ViewerIdentityInterceptor } from '#api/publications/viewer-identity.interceptor.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';

@Controller({ path: 'publications', version: '1' })
@UseGuards(AuthGuard)
export class PublicationsController {
  public constructor(private readonly publicationsService: PublicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseAuth()
  @ZodSerializerDto(PublishResponseDto)
  public async publish(
    @User('id') ownerId: string,
    @PublishMultipart() upload: PublishUploadDto,
  ): Promise<PublishResponseDto> {
    return this.publicationsService.publishFromUpload({
      ownerId,
      manifest: upload.manifest,
      files: upload.files,
    });
  }

  @Get(':id')
  @OptionalAuth()
  @ZodSerializerDto(PublicationViewResponseDto)
  public async getPublication(
    @Param('id') publicationId: string,
    @OptionalUser('id') viewerUserId: string | undefined,
  ): Promise<PublicationViewResponseDto> {
    return this.publicationsService.getPublicationForViewer({
      publicationId,
      viewerUserId,
    });
  }

  @Get(':id/access')
  @UseAuth()
  @ZodSerializerDto(PublicationAccessListDto)
  public async listAccess(
    @Param('id') publicationId: string,
    @User('id') ownerId: string,
  ): Promise<PublicationAccessListDto> {
    return this.publicationsService.listAccessGrants({ publicationId, ownerId });
  }

  @Post(':id/access')
  @HttpCode(HttpStatus.CREATED)
  @UseAuth()
  @ZodSerializerDto(PublicationAccessGrantDto)
  public async inviteAccess(
    @Param('id') publicationId: string,
    @User('id') ownerId: string,
    @Body() body: InvitePublicationAccessDto,
  ): Promise<PublicationAccessGrantDto> {
    return this.publicationsService.inviteAccess({
      publicationId,
      ownerId,
      recipientEmail: body.email,
      notifyRecipient: body.notifyRecipient,
    });
  }

  @Delete(':id/access/:accessId')
  @UseAuth()
  @ZodSerializerDto(PublicationAccessGrantDto)
  public async revokeAccess(
    @Param('id') publicationId: string,
    @Param('accessId') accessId: string,
    @User('id') ownerId: string,
  ): Promise<PublicationAccessGrantDto> {
    return this.publicationsService.revokeAccess({ publicationId, ownerId, accessId });
  }

  @Patch(':id/visibility')
  @UseAuth()
  @ZodSerializerDto(PublicationVisibilityUpdateDto)
  public async updateVisibility(
    @Param('id') publicationId: string,
    @User('id') ownerId: string,
    @Body() body: UpdatePublicationVisibilityDto,
  ): Promise<PublicationVisibilityUpdateDto> {
    return this.publicationsService.updateVisibility({
      publicationId,
      ownerId,
      visibility: body.visibility,
    });
  }

  @Patch(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OptionalAuth()
  @UseInterceptors(ViewerIdentityInterceptor)
  public async recordView(
    @Param('id') publicationId: string,
    @ViewerIdentity() identity: ResolvedViewerIdentity,
  ): Promise<void> {
    await this.publicationsService.recordView({ publicationId, identity });
  }
}
