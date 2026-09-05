/* oxlint-disable new-cap -- NestJS parameter decorators */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import {
  PaseoConnectionDto,
  PaseoConnectionListDto,
  PaseoConnectionOfferDto,
  PaseoPairRequestDto,
} from '#api/connectors/paseo/paseo-connector.dto.js';
import { PaseoConnectorService } from '#api/connectors/paseo/paseo-connector.service.js';

/**
 * Directory routes only (SP-10). `diagnose`, `reconnect` and `agents` left with
 * the API's SDK client: the page holds the daemon session, so it answers those
 * questions from the socket it owns rather than through a second hop.
 */
@Controller({ path: 'connectors/paseo', version: '1' })
@UseAuth()
export class PaseoConnectorController {
  public constructor(private readonly connector: PaseoConnectorService) {}

  @Post('pair')
  @HttpCode(HttpStatus.CREATED)
  @ZodSerializerDto(PaseoConnectionDto)
  public async pair(
    @User('id') ownerId: string,
    @Body() request: PaseoPairRequestDto,
  ): ReturnType<PaseoConnectorService['pair']> {
    return this.connector.pair(ownerId, request);
  }

  @Get()
  @ZodSerializerDto(PaseoConnectionListDto)
  public async list(@User('id') ownerId: string): ReturnType<PaseoConnectorService['list']> {
    return this.connector.list(ownerId);
  }

  /**
   * POST, not GET: the response carries pairing material, and a GET would be
   * cached by intermediaries and written into access logs with the resource in
   * the URL. Owner-scoped by the same lookup every other route uses.
   */
  @Post(':id/offer')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(PaseoConnectionOfferDto)
  public async offer(@User('id') ownerId: string, @Param('id') id: string): ReturnType<PaseoConnectorService['offer']> {
    return this.connector.offer(ownerId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revoke(@User('id') ownerId: string, @Param('id') id: string): Promise<void> {
    await this.connector.revoke(ownerId, id);
  }
}
