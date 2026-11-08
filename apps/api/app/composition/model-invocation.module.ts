import { Global, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingModule } from '#api/billing/billing.module.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import {
  DirectModelInvocationService,
  invocationEvidenceRecorderToken,
  modelInvocationServiceKey,
  ModelModule,
} from '@taucad/api-llm-gateway';
import type { ModelInvocationIntent, ModelInvocationResult, ModelInvocationService } from '@taucad/api-llm-gateway';
import { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';
import { ObservedModelInvocationService } from '#api/agent-observability/model-invocation-observer.js';
import type { BillingEnvironment } from '@taucad/api-database/schema/billing.types';
import type { Environment } from '@taucad/api-core';

@Injectable()
class FundedModelInvocationService implements ModelInvocationService {
  public constructor(
    private readonly invocations: BillableModelInvocationService,
    private readonly config: ConfigService<Environment>,
  ) {}

  public async invoke(intent: ModelInvocationIntent): Promise<ModelInvocationResult> {
    const environment = this.config.get<BillingEnvironment>('BILLING_ENVIRONMENT');
    if (!environment) {
      throw new ServiceUnavailableException('Billing environment is unavailable');
    }
    return this.invocations.invoke({ ...intent, environment });
  }
}

/** Selects the funded or direct provider owner before Nest creates its container. */
@Global()
@Module({})
export class ModelInvocationModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    const implementation = options.tauCloudEnabled ? FundedModelInvocationService : DirectModelInvocationService;
    return {
      global: true,
      module: ModelInvocationModule,
      imports: options.tauCloudEnabled ? [BillingModule] : [ModelModule],
      providers: [
        implementation,
        {
          provide: modelInvocationServiceKey,
          /* Agent-evidence capture (T07) observes whichever owner is selected; without it, the owner as is. */
          useFactory: (
            inner: ModelInvocationService,
            recorder: ModelInvocationEvidenceRecorder | undefined,
          ): ModelInvocationService =>
            recorder === undefined
              ? inner
              : new ObservedModelInvocationService(inner, recorder, { admits: options.tauCloudEnabled }),
          inject: [implementation, { token: ModelInvocationEvidenceRecorder, optional: true }],
        },
        {
          /* Billing reports funded settlements (T07) to the same recorder through the gateway's port. */
          provide: invocationEvidenceRecorderToken,
          useFactory: (recorder: ModelInvocationEvidenceRecorder | undefined) => recorder,
          inject: [{ token: ModelInvocationEvidenceRecorder, optional: true }],
        },
      ],
      exports: [modelInvocationServiceKey, invocationEvidenceRecorderToken],
    };
  }
}
