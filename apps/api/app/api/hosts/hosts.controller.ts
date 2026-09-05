/* oxlint-disable new-cap -- NestJS decorators are factories */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createHatchetOwnerAffinity } from '@taucad/jobs-hatchet';
import type { HatchetJobRuntimeAffinity } from '@taucad/jobs-hatchet';

import { AuthGuard } from '#auth/auth.guard.js';
import { PublicAuth, UseAuth, User } from '#auth/decorators/auth.decorator.js';
import {
  ApproveHostPairingDto,
  CreateCloudHostDto,
  CreateHostPairingDto,
  CreateHostSessionDto,
  ExchangeHostPairingDto,
  UpdateHostDeviceDto,
} from '#api/hosts/hosts.dto.js';
import { HostsService } from '#api/hosts/hosts.service.js';

@Controller({ path: 'agents', version: '1' })
@UseGuards(AuthGuard)
export class HostsController {
  public constructor(private readonly hostsService: HostsService) {}

  @Post('pairings')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  public async createPairing(
    @Body() body: CreateHostPairingDto,
  ): Promise<Awaited<ReturnType<HostsService['createPairing']>>> {
    return this.hostsService.createPairing(body.deviceLabel);
  }

  @Post('pairings/approve')
  @UseAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async approvePairing(@Body() body: ApproveHostPairingDto, @User('id') userId: string): Promise<void> {
    await this.hostsService.approvePairing(body.userCode, userId);
  }

  @Post('pairings/token')
  @PublicAuth()
  public async exchangePairing(
    @Body() body: ExchangeHostPairingDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ readonly status: 'pending' } | { readonly deviceId: string; readonly credential: string }> {
    const token = await this.hostsService.exchangePairing(body.deviceCode);
    if (!token) {
      void reply.status(HttpStatus.ACCEPTED);
      return { status: 'pending' };
    }
    return token;
  }

  @Get()
  @UseAuth()
  public async listDevices(@User('id') userId: string): Promise<Awaited<ReturnType<HostsService['listDevices']>>> {
    return this.hostsService.listDevices(userId);
  }

  /**
   * Provision — or recover — this project's cloud host (launcher 3).
   *
   * The response never carries the credential: it goes to the provisioner and
   * nowhere else, so a browser that can call this endpoint still cannot
   * impersonate the host it created.
   *
   * @param body - The project whose host this is.
   * @param userId - The owner.
   * @returns The device the caller can now place turns on.
   */
  @Post('cloud')
  @UseAuth()
  @HttpCode(HttpStatus.CREATED)
  public async provisionCloudHost(
    @Body() body: CreateCloudHostDto,
    @User('id') userId: string,
  ): Promise<Awaited<ReturnType<HostsService['provisionCloudHost']>>> {
    return this.hostsService.provisionCloudHost({ userId, projectId: body.projectId });
  }

  @Get('worker-affinity')
  @PublicAuth()
  public async getWorkerAffinity(
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly runtimeAffinity: HatchetJobRuntimeAffinity }> {
    const device = await this.hostsService.authenticateDevice(authorization);
    if (!device) {
      throw new UnauthorizedException({ code: 'AGENT_CREDENTIAL_REJECTED' });
    }
    return { runtimeAffinity: createHatchetOwnerAffinity(device.ownerId) };
  }

  @Patch(':id')
  @UseAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async renameDevice(
    @Param('id') deviceId: string,
    @Body() body: UpdateHostDeviceDto,
    @User('id') userId: string,
  ): Promise<void> {
    await this.hostsService.renameDevice(deviceId, userId, body.label);
  }

  @Delete(':id')
  @UseAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revokeDevice(@Param('id') deviceId: string, @User('id') userId: string): Promise<void> {
    await this.hostsService.revokeDevice(deviceId, userId);
  }

  /**
   * The run directory rows one host owns — how a client discovers a detached run.
   *
   * @param deviceId - The host to list.
   * @param userId - The owner.
   * @returns Identity and state per run; never any run content (PH19).
   */
  @Get(':id/runs')
  @UseAuth()
  public async listRuns(
    @Param('id') deviceId: string,
    @User('id') userId: string,
  ): Promise<Awaited<ReturnType<HostsService['listRuns']>>> {
    return this.hostsService.listRuns(deviceId, userId);
  }

  @Post(':id/sessions')
  @UseAuth()
  @HttpCode(HttpStatus.CREATED)
  public async createSession(
    @Param('id') deviceId: string,
    @Body() body: CreateHostSessionDto,
    @User('id') userId: string,
  ): Promise<Awaited<ReturnType<HostsService['createSession']>>> {
    return this.hostsService.createSession({ deviceId, userId, runtimeVersion: body.runtimeVersion });
  }
}
