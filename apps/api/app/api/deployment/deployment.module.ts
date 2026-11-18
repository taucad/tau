import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import {
  answerDeployment,
  DeploymentController,
  deploymentAnswerToken,
} from '#api/deployment/deployment.controller.js';

/** Serves `GET /v1/deployment` from the same Cloud flag that selects the funded invocation owner. */
@Module({})
export class DeploymentModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      module: DeploymentModule,
      controllers: [DeploymentController],
      providers: [
        {
          provide: deploymentAnswerToken,
          inject: [ConfigService],
          useFactory: (config: ConfigService<Environment, true>) =>
            answerDeployment({
              tauCloudEnabled: options.tauCloudEnabled,
              billingEnvironment: config.get('BILLING_ENVIRONMENT', { infer: true }),
            }),
        },
      ],
    };
  }
}
