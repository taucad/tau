/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Global, Module, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { TracerService } from '#tracer.service.js';
import { MetricsService } from '#metrics.js';

/** Milliseconds. */
const shutdownTimeout = 5000;

@Global()
@Module({
  providers: [TracerService, MetricsService],
  exports: [TracerService, MetricsService],
})
export class TelemetryModule implements OnApplicationShutdown {
  private readonly logger = new Logger(TelemetryModule.name);

  public async onApplicationShutdown(): Promise<void> {
    this.logger.log('Shutting down OTEL SDK...');

    try {
      const { sdk } = await import('#otel.js');
      const shutdownTimeoutPromise = new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('OTEL shutdown timeout'));
        }, shutdownTimeout);
        timer.unref();
      });
      await Promise.race([sdk.shutdown(), shutdownTimeoutPromise]);
      this.logger.log('OTEL SDK shut down successfully');
    } catch (error) {
      this.logger.warn(`OTEL SDK shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
