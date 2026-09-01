import { expectTypeOf } from 'vitest';
import type { TranscoderEdgeType, TranscoderPlugin } from '@taucad/runtime';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';
import type { ConversionEdge, ExportFormat, ExportOptionsFor } from 'libassimp';

import { plugin, assimp } from '#index.js';
import type { assimpTranscoder } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof assimpTranscoder>]
>();

expectTypeOf(assimp).toEqualTypeOf(plugin);

type AssimpTranscoderPlugin = ReturnType<typeof assimpTranscoder>;
type EdgeMap = AssimpTranscoderPlugin extends TranscoderPlugin<infer Map> ? Map : never;
type EdgeOptions<Edge> = Edge extends TranscoderEdgeType<string, infer Options> ? Options : never;
type Sources = AssimpTranscoderPlugin extends TranscoderPlugin<Record<string, unknown>, infer From> ? From : never;
type TauRoute = Extract<ConversionEdge, { from: 'glb' | 'gltf'; to: Exclude<ExportFormat, 'assjson'> }>;

expectTypeOf<keyof EdgeMap>().toEqualTypeOf<Exclude<ExportFormat, 'assjson'>>();
expectTypeOf<EdgeOptions<EdgeMap['stl']>>().toEqualTypeOf<ExportOptionsFor<'stl'>>();
expectTypeOf<EdgeOptions<EdgeMap['obj']>>().toEqualTypeOf<ExportOptionsFor<'obj'>>();
expectTypeOf<Sources>().toEqualTypeOf<'glb' | 'gltf'>();
expectTypeOf<Extract<TauRoute, { from: 'glb'; to: 'gltf' }>>().not.toBeNever();
expectTypeOf<Extract<TauRoute, { from: 'gltf'; to: 'glb' }>>().not.toBeNever();
expectTypeOf<Extract<TauRoute, { from: 'glb'; to: 'glb' }>>().toBeNever();
expectTypeOf<Extract<TauRoute, { to: 'assjson' }>>().toBeNever();
