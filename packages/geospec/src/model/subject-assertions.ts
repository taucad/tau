/** Completed canonical assertions over private subject admission. @module */

import { createGeoSpecMatcherMethods } from '#assertion-client/client.js';
import { diagnosticForTransport, geometryDiagnosticSchema } from '#model/errors.js';
import { resolveGeoSpecSubject } from '#model/subject.js';
import type { GeoSpecSubject } from '#model/subject.js';
import type { GeoSpecAssertion, GeoSpecMatcher } from '#runner/types.js';

/**
 * Complete a standalone canonical assertion on the subject's admitting host.
 * @param subject - The opaque subject returned by the host's loader.
 * @returns Synchronous matcher methods retaining the admitting owner.
 * @internal
 */
export const expectGeoSubject = (subject: GeoSpecSubject): GeoSpecMatcher => {
  const admission = resolveGeoSpecSubject(subject);
  const chain = admission.client.expectGeo(admission.identity);
  const wrap = (negative: boolean): Omit<GeoSpecMatcher, 'not'> =>
    createGeoSpecMatcherMethods({
      subject,
      polarity: negative ? 'negative' : 'positive',
      invoke: (invocation): GeoSpecAssertion => {
        resolveGeoSpecSubject(subject);
        const methods = negative ? chain.not : chain;
        const report = Reflect.apply(methods[invocation.matcher], methods, invocation.arguments) as ReturnType<
          typeof chain.toBeWatertight
        >;
        const diagnostics = report.diagnostics.map((value) =>
          diagnosticForTransport(geometryDiagnosticSchema.parse(value)),
        );
        return {
          kind: invocation.kind,
          subject: admission.identity,
          ...(admission.load === undefined ? {} : { loadId: admission.load.loadId }),
          expected: invocation.expected,
          passed: report.status === 'passed',
          diagnostics,
          report,
        };
      },
    });
  return Object.assign(wrap(false), { not: wrap(true) });
};
