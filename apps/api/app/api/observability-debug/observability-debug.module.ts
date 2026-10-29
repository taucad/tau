import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ObservabilityDebugController } from '#api/observability-debug/observability-debug.controller.js';
import { isObservabilityFailureRouteEnabled } from '#api/observability-debug/observability-debug.gate.js';
import type { ObservabilityGateEnvironment } from '#api/observability-debug/observability-debug.gate.js';

@Module({})
export class ObservabilityDebugModule {
  /**
   * The module, with the failure route only on a Sentry-reporting staging API.
   *
   * @param environment - The process environment the gate reads.
   * @returns The module, without controllers anywhere else.
   */
  public static forRoot(environment: ObservabilityGateEnvironment): DynamicModule {
    return {
      module: ObservabilityDebugModule,
      controllers: isObservabilityFailureRouteEnabled(environment) ? [ObservabilityDebugController] : [],
    };
  }
}
