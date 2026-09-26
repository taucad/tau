---
parameters: minor
---

Admit parameter schemas written in the OGC profile of JSON Schema 2020-12 beside Draft-07. The dialect comes from `$schema`: a document without one stays Draft-07, and any other dialect is refused with `UNSUPPORTED_DIALECT`. Each dialect uses its own definitions keyword (`$defs` or `definitions`) and reference prefix. In 2020-12 documents the OpenAPI numeric formats `float`, `double`, `int32` and `uint32` become carrier widths, while `int64`, `uint64` and other numeric formats are refused with `UNSUPPORTED_FORMAT`; Draft-07 keeps `format` an inert annotation. `@taucad/parameters/schema` exports the `JsonSchemaDialect` type.
