import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { middleware } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';

export const defaultRuntime = defineRuntime({
  plugins: [
    esbuild(),
    middleware(),
    replicad(),
    opencascade(),
    jscad(),
    manifold(),
    picovoxel(),
    gltf(),
    brep(),
    rhino(),
    image(),
    assimp({ preset: 'all' }),
  ],
});
