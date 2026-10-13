import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import { KernelsService } from '#api/kernels/kernels.service.js';
import { ZooTokenService } from '#api/kernels/zoo-token.service.js';
import { ZooTokensController } from '#api/kernels/zoo-tokens.controller.js';
import type { Environment } from '#config/environment.config.js';

@Module({})
export class KernelsModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      module: KernelsModule,
      controllers: [ZooTokensController],
      providers: [
        KernelsGateway,
        ZooTokenService,
        {
          provide: KernelsService,
          inject: [ConfigService],
          useFactory: (config: ConfigService<Environment, true>) =>
            new KernelsService(config, options.tauCloudEnabled ? 'cloud' : 'self-host'),
        },
      ],
      exports: [KernelsService],
    };
  }
}
