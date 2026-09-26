---
parameters: patch
---

`projectParameterSchema` copies `default`, `const`, `enum` and `examples` verbatim into the `'draft-07'` view, and so into every manifest's `legacyProjection`. It used to walk these data values as schemas, so an object value lost or re-spelled keys named like carrier keywords (a default of `{ unit: 'mm', value: 3 }` became `{ 'x-ogc-unit': 'mm', 'x-ogc-unitLang': 'UCUM' }`). Manifests with such values get a new revision; every other manifest keeps its revision. `projectJsonSchemaToParameterDeclaration` likewise strips an authored `pattern` only from schema objects, so an enum of objects with a `pattern` key is no longer refused as a duplicate.
