import { build } from 'esbuild';
await build({
  entryPoints: ['scripts/native-renderer-spike/viewer.mts'],
  bundle: true,
  format: 'esm',
  outfile: 'scripts/native-renderer-spike/viewer.js',
  alias: {
    '#components/geometry/graphics/three/reversed-depth-transparent-sort.js':
      './apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts',
  },
});
