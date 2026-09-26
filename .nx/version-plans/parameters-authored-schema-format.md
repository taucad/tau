---
parameters: minor
---

Admit parameter schemas written in the OGC profile of JSON Schema 2020-12 beside Draft-07. The dialect comes from `$schema`: a document without one stays Draft-07, and any other dialect is refused with `UNSUPPORTED_DIALECT`. Each dialect uses its own definitions keyword (`$defs` or `definitions`) and reference prefix. In 2020-12 documents the OpenAPI numeric formats `float`, `double`, `int32` and `uint32` become carrier widths, while `int64`, `uint64` and other numeric formats are refused with `UNSUPPORTED_FORMAT`; Draft-07 keeps `format` an inert annotation. `@taucad/parameters/schema` exports the `JsonSchemaDialect` type.

The OGC quantity keywords are admitted and lifted into bindings: `x-ogc-definition` names the QUDT quantity kind, with `x-tau-quantity-kind` accepted as an inbound alias; `x-ogc-unit` alone is read as UCUM and may stand beside semantic claims; `x-tau-symbols` carries locale symbols. Disagreeing unit or quantity-kind spellings are refused with `METADATA_CONFLICT`, a QUDT unit language with `UNSUPPORTED_UNIT_LANGUAGE`, and a definition that is not a reviewed quantity kind with `UNSUPPORTED_DEFINITION`. The Tau/OGC unit conflict moves from the adapter's `NATIVE_PROJECTION_UNSUPPORTED` to admission's `METADATA_CONFLICT`.

`admitParameterDeclaration`, and so manifest compilation and admission, refuses `x-tau-*` and `x-ogc-*` keywords inside the native carrier with `INVALID_ANNOTATION`. The carrier ignored them before, silently dropping the claim; declare quantity semantics in `bindings`, or admit an authored JSON Schema through the adapter, which lifts them.

`projectParameterSchema(source, { dialect })` replaces `projectParameterSchemaToDraft7`, and `ParameterSchemaProjection` replaces `ParameterLegacyProjection`. The default `'2020-12'` view is the OGC profile: `$defs`, OpenAPI numeric formats, `x-ogc-unit` with `x-ogc-unitLang`, `x-ogc-definition` for the quantity kind taken from the bindings, `x-tau-space`, `x-tau-reference`, `x-tau-symbol` and `x-tau-symbols`, and no `$id`. The `'draft-07'` view is the one every manifest embeds as `legacyProjection`, which is unchanged, so manifest revisions and cached manifests stay valid. The package entry also exports the `JsonSchema`, `JsonSchemaDialect` and `ParameterSchemaProjectionOptions` types.

`projectDraft7SchemaToParameterDeclaration` and `Draft7ParameterDeclarationInput` are renamed `projectJsonSchemaToParameterDeclaration` and `JsonSchemaParameterDeclarationInput`, because the adapter admits both dialects.
