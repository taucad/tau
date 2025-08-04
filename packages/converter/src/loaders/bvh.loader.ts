import type { Object3D } from 'three';
import { AnimationMixer, AnimationObjectGroup, Group, SkeletonHelper } from 'three';
import { BVHLoader } from 'three/addons';
import type { BVH } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class BvhLoader extends ThreeJsBaseLoader<BVH> {
  private readonly loader = new BVHLoader();

  protected async parseAsync(data: Uint8Array): Promise<BVH> {
    const text = this.uint8ArrayToText(data);
    return this.withPromise(() => this.loader.parse(text));
  }

  protected mapToObject(parseResult: BVH): Object3D {
    const group = new Group();

    for (const bone of parseResult.skeleton.bones) {
      const skeletonHelper = new SkeletonHelper(bone);
      group.add(skeletonHelper);
      group.add(bone);
    }

    const animationObjectGroup = new AnimationObjectGroup(group);
    const mixer = new AnimationMixer(animationObjectGroup);
    const action = mixer.clipAction(parseResult.clip);
    action.play();

    return group;
  }
}
