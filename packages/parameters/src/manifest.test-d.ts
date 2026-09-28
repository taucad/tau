import { expectTypeOf } from 'vitest';
import type { JSONSchema7 } from '@taucad/json-schema';
import { projectParameterSchema } from '@taucad/parameters';
import type * as parameters from '@taucad/parameters';
import type {
  JsonSchema,
  JsonSchemaDialect,
  ParameterManifest,
  ParameterSchemaProjection,
  ParameterSchemaProjectionOptions,
} from '@taucad/parameters';

type UsableSchema<Projection> = Projection extends { status: 'usable'; schema: infer Schema } ? Schema : never;

const views = (manifest: ParameterManifest) => ({
  ogc: projectParameterSchema(manifest),
  draft07: projectParameterSchema(manifest, { dialect: 'draft-07' }),
});
type Views = ReturnType<typeof views>;

// The default view is the 2020-12 OGC profile; asking for Draft-07 narrows the schema to JSONSchema7.
expectTypeOf<Views['ogc']['dialect']>().toEqualTypeOf<'2020-12'>();
expectTypeOf<UsableSchema<Views['ogc']>>().toEqualTypeOf<JsonSchema>();
expectTypeOf<Views['draft07']['dialect']>().toEqualTypeOf<'draft-07'>();
expectTypeOf<UsableSchema<Views['draft07']>>().toEqualTypeOf<JSONSchema7>();

// The manifest embeds the Draft-07 view under the same public type.
expectTypeOf<ParameterManifest['legacyProjection']>().toEqualTypeOf<ParameterSchemaProjection<'draft-07'>>();
expectTypeOf<ParameterSchemaProjectionOptions['dialect']>().toEqualTypeOf<JsonSchemaDialect | undefined>();

// Every public signature names only exported types, and the Draft-07-only projection is gone.
expectTypeOf(projectParameterSchema).parameter(0).toEqualTypeOf<Pick<ParameterManifest, 'schema' | 'bindings'>>();
expectTypeOf<typeof parameters>().not.toHaveProperty('projectParameterSchemaToDraft7');
// Only the dialects admission reads are projected.
expectTypeOf<{ dialect: '2019-09' }>().not.toExtend<ParameterSchemaProjectionOptions>();
