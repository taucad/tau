/** Completed canonical assertions over private subject admission. @module */

import { createGeoSpecMatcherMethods } from '#assertion-client/client.js';
import { diagnosticForTransport, geometryDiagnosticSchema } from '#model/errors.js';
import { regionScopeRefusal } from '#model/region-scope.js';
import { resolveGeoSpecSubject } from '#model/subject.js';
import type { GeoSpecLoadRegion } from '#model/types.js';
import type { GeoSpecSubject } from '#model/subject.js';
import type { GeoSpecAssertion, GeoSpecExpectOptions, GeoSpecMatcher } from '#runner/types.js';

/**
 * Complete a standalone canonical assertion on the subject's admitting host.
 * @param subject - The opaque subject returned by the host's loader.
 * @param options - Chain options; a `workUnitLimit` overrides the subject's `loadModel` budget.
 * @returns Synchronous matcher methods retaining the admitting owner.
 * @internal
 */
export const expectGeoSubject = (subject: GeoSpecSubject, options?: GeoSpecExpectOptions): GeoSpecMatcher => {
  const admission = resolveGeoSpecSubject(subject);
  const workUnitLimit = options?.workUnitLimit ?? admission.load?.workUnitLimit;
  const chain = admission.client.expectGeo(
    admission.identity,
    workUnitLimit === undefined ? undefined : { workUnitLimit },
  );
  const wrap = (negative: boolean): Omit<GeoSpecMatcher, 'not'> =>
    createGeoSpecMatcherMethods({
      subject,
      polarity: negative ? 'negative' : 'positive',
      invoke: (invocation): GeoSpecAssertion => {
        resolveGeoSpecSubject(subject);
        const region = admission.load?.region;
        const scoped: GeoSpecLoadRegion | undefined =
          region === undefined ? undefined : { min: [...region.min], max: [...region.max] };
        const scope = scoped === undefined ? {} : { region: scoped };
        const regionRefusal = regionScopeRefusal(region, invocation.kind);
        if (regionRefusal !== undefined) {
          // A whole-model claim on a crop is refused before the engine: no verdict either way.
          return {
            kind: invocation.kind,
            subject: admission.identity,
            ...(admission.load === undefined ? {} : { loadId: admission.load.loadId }),
            ...scope,
            expected: invocation.expected,
            passed: false,
            diagnostics: [regionRefusal],
          };
        }
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
          ...scope,
          expected: invocation.expected,
          passed: report.status === 'passed',
          diagnostics,
          report,
        };
      },
    });
  return Object.assign(wrap(false), { not: wrap(true) });
};
