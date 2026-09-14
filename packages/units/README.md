# @taucad/units

[![npm version](https://img.shields.io/npm/v/%40taucad%2Funits.svg)](https://www.npmjs.com/package/@taucad/units)
[![weekly downloads](https://img.shields.io/npm/dw/%40taucad%2Funits.svg)](https://www.npmjs.com/package/@taucad/units)
[![bundle size](https://img.shields.io/bundlephobia/minzip/%40taucad%2Funits)](https://bundlephobia.com/package/@taucad/units)
[![license](https://img.shields.io/npm/l/%40taucad%2Funits.svg)](./LICENSE)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)

Portable checked units, quantities, parsing, and formatting

## Why this package?

- Validates complete, case-sensitive UCUM codes before execution.
- Keeps dimensions, quantity kinds, mathematical spaces, references, and assumptions explicit.
- Returns structured success, invalid, unsupported, or indeterminate results instead of throwing for data errors.
- Preserves decimal source text when no decimal execution engine is available.
- Runs in ESM environments without a DOM or runtime framework.

## Installation

```bash
npm install @taucad/units
# pnpm add @taucad/units
# yarn add @taucad/units
```

The package has no peer dependencies. Its exact UCUM provider is installed as a regular dependency.

## Quick start

```typescript
import { formatQuantity, parseInput } from '@taucad/units/input';
import { convert, quantityKinds } from '@taucad/units/quantity';

const parsed = parseInput({
  text: '1/2 in',
  kind: quantityKinds.length,
  space: 'linear',
});

if (parsed.status !== 'success') {
  throw new Error(`${parsed.diagnostic.code}: ${parsed.diagnostic.message}`);
}

const converted = convert({ quantity: parsed.value.quantity, to: 'mm' });
if (converted.status !== 'success') {
  throw new Error(`${converted.diagnostic.code}: ${converted.diagnostic.message}`);
}

const formatted = formatQuantity({ quantity: converted.value, locale: 'en-NZ' });
if (formatted.status !== 'success') {
  throw new Error(`${formatted.diagnostic.code}: ${formatted.diagnostic.message}`);
}

console.log(formatted.value.text); // 12.7 mm
```

## Public API

| Subpath                  | Exports                                                                                                           | Purpose                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@taucad/units`          | No runtime exports                                                                                                | Side-effect-free package root                                |
| `@taucad/units/unit`     | `admitUnit`, `unitLimits`, `unitProfile`, unit and diagnostic types                                               | Bounded UCUM admission and SI/provider dimension reporting   |
| `@taucad/units/quantity` | `createQuantity`, `convert`, `checkOperation`, `linearize`, `quantityKinds`, `quantityReferences`, quantity types | Checked quantity construction, conversion, and algebra       |
| `@taucad/units/input`    | `parseInput`, `formatQuantity`, input and output types                                                            | Complete locale-aware parsing and safe text/parts formatting |

The quantity-kind constants are a small exact table of QUDT 3.5.1 URIs and reviewed relations. An unrecognized absolute URI is preserved as unknown; operations that need a known relationship return `indeterminate`. Equal dimensions alone do not establish kind equivalence. Plane angle remains a checked dimension even though SI treats radians as dimensionless.

Quantities in `point` space require a supported reference. The initial temperature profile uses `quantityReferences.thermodynamicAbsoluteZero`; temperature differences use `difference` space. Decimal quantities retain their exact string and can be formatted without conversion, but arithmetic returns `unsupported` until a decimal engine is supplied by a future profile.

Numeric execution uses finite binary64. A nontrivial conversion records `numericProvenance` with the `ucum-lhc-7.1.9` source, applied scale factor, and `binary64-rounded` behavior; the package does not claim a fixed error bound that the provider cannot prove. Operations reject non-finite results, report finite underflow as `unsupported`, and reject results that violate a requested `safe-integer` representation. Derived quantities retain a revalidatable unit-expression tree and scale, while no-op conversion preserves the authoritative native value.

## Environment matrix

| Subpath      | Browser                       | Node.js 24+ | Edge/worker ESM               | DOM required |
| ------------ | ----------------------------- | ----------- | ----------------------------- | ------------ |
| Package root | Yes                           | Yes         | Yes                           | No           |
| `/unit`      | Yes                           | Yes         | Yes                           | No           |
| `/quantity`  | Yes                           | Yes         | Yes                           | No           |
| `/input`     | Yes, with `Intl.NumberFormat` | Yes         | Yes, with `Intl.NumberFormat` | No           |

## Versioning & stability

This package is pre-1.0. Minor releases may contain breaking API changes. Tau coordinates versions and release policy in the [workspace release policy](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md).

## Security & provenance

Official releases are expected to carry npm registry provenance. Verify installed registry signatures with:

```bash
npm audit signatures
```

Treat unit strings and serialized quantity metadata as untrusted input. Pass them through the public checked functions before use.

## License

`@taucad/units` is licensed under [Apache-2.0](./LICENSE). It depends on `@lhncbc/ucum-lhc` 7.1.9 and preserves that project's original UCUM, LOINC, and redistribution terms in [NOTICE](./NOTICE).

## Links

- [Documentation](https://github.com/taucad/tau/tree/main/packages/units#readme)
- [Source](https://github.com/taucad/tau/tree/main/packages/units)
- [Changelog](./CHANGELOG.md)
- [Issue tracker](https://github.com/taucad/tau/issues)
- [Discussions](https://github.com/taucad/tau/discussions)
