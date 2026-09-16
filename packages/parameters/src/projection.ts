import { convert, createQuantity } from '@taucad/units/quantity';
import type { CurrentFileParameterEntry } from '@taucad/types';
import type { UnitDiagnostic } from '@taucad/units/unit';
import type { ParameterBinding, ParameterManifest } from '#manifest.js';
import { resolveParameterBinding } from '#manifest.js';
import { resolveEffectiveParameterBinding, resolveEffectiveParameterProvenance } from '#values.js';

/** Presentation request for one admitted manifest field. @public */
export type ParameterFieldDisplay = Readonly<{
  unit?: string;
  locale?: string;
}>;

/** Persisted project binding that can refine an admitted field projection. @public */
export type ParameterFieldAuthorityBinding = NonNullable<
  CurrentFileParameterEntry['groups'][string]['bindings']
>[string];

/** UI-neutral projection of one effective parameter binding. @public */
export type ParameterFieldProjection = Readonly<{
  status: 'unit-bearing' | 'dimensionless' | 'unknown' | 'unsupported';
  instancePointer: string;
  parameterId?: string;
  schema?: ParameterBinding['schema'];
  representation?: ParameterBinding['representation'];
  constraints?: ParameterBinding['constraints'];
  nativeUnit?: string;
  quantityKind?: string;
  space?: ParameterBinding['space'];
  reference?: string;
  displayUnit?: string;
  adornment?: string;
  unitOrigin?: 'declared' | 'project' | 'inferred' | 'derived';
  inferredFields?: ReadonlyArray<'unit' | 'quantityKind' | 'space' | 'reference'>;
  guessed: boolean;
  diagnostic?: UnitDiagnostic;
}>;

const symbols = new Map<string, string>([
  ['deg', '°'],
  ['Cel', '°C'],
  ['[degF]', '°F'],
]);

const declaredSymbol = (binding: ParameterBinding, displayUnit: string, locale?: string): string | undefined => {
  if (displayUnit !== binding.unit) {
    return undefined;
  }
  if (locale !== undefined && binding.symbols !== undefined) {
    try {
      const requested = Intl.getCanonicalLocales(locale)[0];
      const localized = Object.entries(binding.symbols).find(([key]) => {
        if (!key.startsWith('lang:')) {
          return false;
        }
        try {
          return Intl.getCanonicalLocales(key.slice(5))[0] === requested;
        } catch {
          return false;
        }
      });
      if (localized !== undefined) {
        return localized[1];
      }
    } catch {
      // Invalid presentation locales fall through to the declared default.
    }
  }
  return binding.symbols?.['default'] ?? binding.symbol;
};

const unsupported = (
  instancePointer: string,
  binding: ParameterBinding,
  diagnostic: UnitDiagnostic,
): ParameterFieldProjection => ({
  status: 'unsupported',
  instancePointer,
  parameterId: binding.parameter.value,
  schema: binding.schema,
  representation: binding.representation,
  constraints: binding.constraints,
  nativeUnit: binding.unit,
  quantityKind: binding.quantityKind,
  space: binding.space,
  reference: binding.reference,
  guessed: false,
  diagnostic,
});

/**
 * Project one admitted manifest binding for UI, SDK, and agent consumers.
 * @param manifest - Effective admitted parameter manifest.
 * @param instancePointer - JSON instance pointer of the field.
 * @param display - Optional client-owned display unit and locale.
 * @returns A stable field projection without changing native values.
 * @public
 */
// oxlint-disable-next-line max-params -- Projection correlates one optional persisted authority binding.
export const projectParameterField = (
  manifest: ParameterManifest,
  instancePointer: string,
  display: ParameterFieldDisplay = {},
  authorityBinding?: ParameterFieldAuthorityBinding,
): ParameterFieldProjection => {
  const nativeBinding = resolveParameterBinding(manifest, instancePointer);
  if (!nativeBinding) {
    return { status: 'unknown', instancePointer, guessed: false };
  }
  const binding = resolveEffectiveParameterBinding(manifest, instancePointer, nativeBinding, authorityBinding);
  if (binding.representation === 'decimal') {
    return unsupported(instancePointer, binding, {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal values are preserved but are not executable by this runtime profile.',
    });
  }
  const fields = ['unit', 'quantityKind', 'space', 'reference'] as const;
  const fieldProvenance = Object.fromEntries(
    fields.map((field) => [
      field,
      resolveEffectiveParameterProvenance(manifest, instancePointer, nativeBinding, field, authorityBinding),
    ]),
  ) as Record<(typeof fields)[number], ReturnType<typeof resolveEffectiveParameterProvenance>>;
  const unitOrigin = fieldProvenance.unit?.origin ?? (binding.unit === undefined ? undefined : 'declared');
  const inferredFields = fields.filter((field) => fieldProvenance[field]?.origin === 'inferred');
  if (binding.unit === undefined) {
    return {
      status: 'unknown',
      instancePointer,
      parameterId: binding.parameter.value,
      schema: binding.schema,
      representation: binding.representation,
      constraints: binding.constraints,
      quantityKind: binding.quantityKind,
      space: binding.space,
      reference: binding.reference,
      unitOrigin,
      ...(inferredFields.length === 0 ? {} : { inferredFields }),
      guessed: inferredFields.length > 0,
    };
  }
  const displayUnit = display.unit ?? binding.unit;
  const quantity = createQuantity({
    value: 0,
    representation: 'binary64',
    unit: binding.unit,
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  });
  const converted = quantity.status === 'success' ? convert({ quantity: quantity.value, to: displayUnit }) : quantity;
  if (converted.status !== 'success') {
    return unsupported(instancePointer, binding, converted.diagnostic);
  }
  return {
    status: binding.unit === '1' ? 'dimensionless' : 'unit-bearing',
    instancePointer,
    parameterId: binding.parameter.value,
    schema: binding.schema,
    representation: binding.representation,
    constraints: binding.constraints,
    nativeUnit: binding.unit,
    quantityKind: binding.quantityKind,
    space: binding.space,
    reference: binding.reference,
    displayUnit,
    adornment:
      declaredSymbol(binding, displayUnit, display.locale) ??
      (binding.unit === '1' ? undefined : (symbols.get(displayUnit) ?? displayUnit)),
    unitOrigin,
    ...(inferredFields.length === 0 ? {} : { inferredFields }),
    guessed: inferredFields.length > 0,
  };
};
