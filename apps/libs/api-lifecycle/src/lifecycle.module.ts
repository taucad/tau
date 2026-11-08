/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Global, Module } from '@nestjs/common';
import { ShutdownService } from '#shutdown.service.js';
import { UpgradeRouter } from '#upgrade-router.js';

/** The process-wide stop signal, shutdown work registry and upgrade router. */
@Global()
@Module({
  providers: [ShutdownService, UpgradeRouter],
  exports: [ShutdownService, UpgradeRouter],
})
export class LifecycleModule {}
