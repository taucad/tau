import { Module } from '@nestjs/common';

import { DatabaseModule } from '@taucad/api-database';
import { HostsController } from '#hosts.controller.js';
import { HostsGateway } from '#hosts.gateway.js';
import { HostsService } from '#hosts.service.js';
import { PublicationRateLimiterService } from '@taucad/api-redis';
import { cloudHostProvisionerToken, createConfiguredCloudHostProvisioner } from '#cloud-host.provisioner.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HostsController],
  providers: [
    HostsService,
    HostsGateway,
    /* The API's one Redis budget primitive, provided here as `GitModule` does:
       it holds no state of its own, so every instance shares one keyspace. */
    PublicationRateLimiterService,
    /* One port, one shipped implementation. A deployment that runs its hosts
     * somewhere other than the local Docker daemon replaces this provider and
     * nothing else. */
    { provide: cloudHostProvisionerToken, useFactory: createConfiguredCloudHostProvisioner },
  ],
  exports: [HostsService],
})
export class HostsModule {}
