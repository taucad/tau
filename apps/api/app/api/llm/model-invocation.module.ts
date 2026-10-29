import { Global, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingModule } from '#api/billing/billing.module.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { DirectModelInvocationService } from '#api/llm/direct-model-invocation.service.js';
import { ModelModule } from '#api/models/model.module.js';
import type {
  ModelInvocationIntent,
  ModelInvocationResult,
  ModelInvocationService,
} from '#api/llm/model-invocation.types.js';
import { modelInvocationServiceKey } from '#api/llm/model-invocation.types.js';
import { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';
import { ObservedModelInvocationService } from '#api/agent-observability/model-invocation-observer.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';
import type { Environment } from '#config/environment.config.js';

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
      ],
      exports: [modelInvocationServiceKey],
    };
  }
}
