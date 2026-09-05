import { Module } from '@nestjs/common';

import { DatabaseModule } from '#database/database.module.js';
import { HostsController } from '#api/hosts/hosts.controller.js';
import { HostsGateway } from '#api/hosts/hosts.gateway.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { cloudHostProvisionerToken, createConfiguredCloudHostProvisioner } from '#api/hosts/cloud-host.provisioner.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HostsController],
  providers: [
    HostsService,
    HostsGateway,
    /* One port, one shipped implementation. A deployment that runs its hosts
     * somewhere other than the local Docker daemon replaces this provider and
     * nothing else. */
    { provide: cloudHostProvisionerToken, useFactory: createConfiguredCloudHostProvisioner },
  ],
  exports: [HostsService],
})
export class HostsModule {}
