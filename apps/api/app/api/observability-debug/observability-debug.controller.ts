/* oxlint-disable new-cap -- NestJS decorators use PascalCase. */
import { Controller, Get } from '@nestjs/common';

/** The error the failure route throws: an unhandled server error the exception filter reports to Sentry. */
export class ObservabilityHarnessFailure extends Error {
  public override readonly name = 'ObservabilityHarnessFailure';
}

/**
 * The staging observability harness's API failure (browser observability A12, SB13): every request fails with a 500
 * that the exception filter reports to Sentry with its `request_id`, which the browser's harness reads back from the
 * `request-id` response header. Registered only when `isObservabilityFailureRouteEnabled` holds.
 */
@Controller({ path: '__debug/observability', version: '1' })
export class ObservabilityDebugController {
  @Get('failure')
  public fail(): never {
    throw new ObservabilityHarnessFailure('Observability harness API failure');
  }
}
