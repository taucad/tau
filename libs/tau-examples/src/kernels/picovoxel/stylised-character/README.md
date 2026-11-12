# Stylised Owl

A stylised character built the way the `cad-picovoxel` skill recommends for toy-like figures (blueprint E17): every part is a signed-distance expression, the parts are joined with a smooth union (`smin`), and one `createVoxels({ shape: 'implicit' })` call turns the field into a single watertight body.

- `lib/sdf.ts`: `sphere`, `ellipsoid`, `capsule`, `smoothUnion`, `subtract` and `mirrored`, as serializable `SdfExpression`s that fill in parallel.
- Parameters: `height` (mm), `blend` (the smooth-union width in mm at 60 mm tall) and `voxelSize`.
- Expected cost: light, about a second at the default `voxelSize` of 0.5 mm.
- Original Tau example, Apache-2.0.
