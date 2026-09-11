import { describe, expectTypeOf, it } from 'vitest';
import type { ActionDigest, ContentDigest, SceneDigest } from '@taucad/cache-core';
import type { GeometryGltf } from '@taucad/types';
import type {
  KernelSceneRuntime,
  ProgressiveSceneCapability,
  ProgressiveSceneUpdate,
  PublishSceneGraphUpdateInput,
  PublishSceneUpdateInput,
  PublishSceneUpdateOutcome,
  SceneAssetReplacement,
  TauSceneOperation,
} from '#types/runtime-scene.types.js';

declare const actionDigest: ActionDigest;
declare const contentDigest: ContentDigest;
declare const sceneDigest: SceneDigest;
declare const update: ProgressiveSceneUpdate;
declare const runtime: KernelSceneRuntime;

describe('progressive scene public contracts', () => {
  it('keeps digest domains distinct', () => {
    expectTypeOf(actionDigest).not.toEqualTypeOf<ContentDigest>();
    expectTypeOf(contentDigest).not.toEqualTypeOf<SceneDigest>();
    expectTypeOf(sceneDigest).not.toEqualTypeOf<ActionDigest>();
  });

  it('keeps GeometryGltf atomic', () => {
    expectTypeOf<keyof GeometryGltf>().toEqualTypeOf<'format' | 'content'>();
  });

  it('narrows every update kind exhaustively', () => {
    switch (update.type) {
      case 'reset': {
        expectTypeOf(update.snapshot).toBeObject();
        break;
      }
      case 'delta': {
        expectTypeOf(update.operations).toEqualTypeOf<readonly TauSceneOperation[]>();
        break;
      }
      case 'refinement': {
        expectTypeOf(update.replacements).toEqualTypeOf<readonly SceneAssetReplacement[]>();
        break;
      }
      case 'bookmark': {
        expectTypeOf(update.bookmark).toBeObject();
        break;
      }
      default: {
        expectTypeOf(update).toBeNever();
      }
    }
  });

  it('uses an always-present capability facet and named readonly sink inputs', () => {
    expectTypeOf<ProgressiveSceneCapability['type']>().toEqualTypeOf<'unsupported' | 'supported'>();
    expectTypeOf<Parameters<typeof runtime.publish>[0]>().toEqualTypeOf<PublishSceneUpdateInput>();
    expectTypeOf<Parameters<typeof runtime.publishUpdate>[0]>().toEqualTypeOf<PublishSceneGraphUpdateInput>();
    expectTypeOf<ReturnType<typeof runtime.publish>>().toEqualTypeOf<Promise<PublishSceneUpdateOutcome>>();
    expectTypeOf<ReturnType<typeof runtime.publishUpdate>>().toEqualTypeOf<Promise<PublishSceneUpdateOutcome>>();
  });
});
