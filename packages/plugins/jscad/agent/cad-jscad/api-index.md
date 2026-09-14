# @jscad/modeling API index

@jscad/modeling 2.13.0 · 729 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## colors — `api-colors.md`

colors (namespace) [16 members]
  colors.colorize (function)
  colors.colorNameToRgb (function)
  colors.cssColors (namespace)
  colors.hexToRgb (function)
  colors.hslToRgb (function)
  colors.hsvToRgb (function)
  colors.hueToColorComponent (function)
  colors.rgbToHex (function)
  colors.rgbToHsl (function)
  colors.rgbToHsv (function)
  colors.RGB (type)
  colors.RGBA (type)
  colors.HSL (type)
  colors.HSLA (type)
  colors.HSV (type)
  colors.HSVA (type)

## curves — `api-curves.md`

curves (namespace) [1 members]
  curves.bezier (namespace)

## geometries — `api-geometries.md`

geometries (namespace) [5 members]
  geometries.geom2 (namespace)
  geometries.geom3 (namespace)
  geometries.path2 (namespace)
  geometries.poly2 (namespace)
  geometries.poly3 (namespace)

## maths — `api-maths.md`

maths (namespace) [9 members]
  maths.constants (namespace)
  maths.line2 (namespace)
  maths.line3 (namespace)
  maths.mat4 (namespace)
  maths.plane (namespace)
  maths.utils (namespace)
  maths.vec2 (namespace)
  maths.vec3 (namespace)
  maths.vec4 (namespace)

## measurements — `api-measurements.md`

measurements (namespace) [13 members]
  measurements.measureAggregateArea (function)
  measurements.measureAggregateBoundingBox (function)
  measurements.measureAggregateEpsilon (function)
  measurements.measureAggregateVolume (function)
  measurements.measureArea (function)
  measurements.measureBoundingBox (function)
  measurements.measureBoundingSphere (function)
  measurements.measureCenter (function)
  measurements.measureCenterOfMass (function)
  measurements.measureDimensions (function)
  measurements.measureEpsilon (function)
  measurements.measureVolume (function)
  measurements.BoundingBox (type)

## primitives — `api-primitives.md`

primitives (namespace) [41 members]
  primitives.arc (function)
  primitives.ArcOptions (interface)
  primitives.circle (function)
  primitives.CircleOptions (interface)
  primitives.cube (function)
  primitives.CubeOptions (interface)
  primitives.cuboid (function)
  primitives.CuboidOptions (interface)
  primitives.cylinder (function)
  primitives.CylinderOptions (interface)
  primitives.cylinderElliptic (function)
  primitives.CylinderEllipticOptions (interface)
  primitives.ellipse (function)
  primitives.EllipseOptions (interface)
  primitives.ellipsoid (function)
  primitives.EllipsoidOptions (interface)
  primitives.geodesicSphere (function)
  primitives.GeodesicSphereOptions (interface)
  primitives.line (function)
  primitives.polygon (function)
  primitives.PolygonOptions (interface)
  primitives.polyhedron (function)
  primitives.PolyhedronOptions (interface)
  primitives.rectangle (function)
  primitives.RectangleOptions (interface)
  primitives.roundedCuboid (function)
  primitives.RoundedCuboidOptions (interface)
  primitives.roundedCylinder (function)
  primitives.RoundedCylinderOptions (interface)
  primitives.roundedRectangle (function)
  primitives.RoundedRectangleOptions (interface)
  primitives.sphere (function)
  primitives.SphereOptions (interface)
  primitives.square (function)
  primitives.SquareOptions (interface)
  primitives.star (function)
  primitives.StarOptions (interface)
  primitives.torus (function)
  primitives.TorusOptions (interface)
  primitives.triangle (function)
  primitives.TriangleOptions (interface)

## text — `api-text.md`

text (namespace) [6 members]
  text.vectorChar (function)
  text.VectorChar (interface)
  text.VectorCharOptions (interface)
  text.vectorText (function)
  text.VectorText (interface)
  text.VectorTextOptions (interface)

## utils — `api-utils.md`

utils (namespace) [7 members]
  utils.areAllShapesTheSameType (function)
  utils.degToRad (function)
  utils.flatten (function)
  utils.fnNumberSort (function)
  utils.insertSorted (function)
  utils.radiusToSegments (function)
  utils.radToDeg (function)

## booleans — `api-booleans.md`

booleans (namespace) [5 members]
  booleans.intersect (function)
  booleans.minkowski (function)
  booleans.subtract (function)
  booleans.union (function)
  booleans.scission (function)

## expansions — `api-expansions.md`

expansions (namespace) [4 members]
  expansions.expand (function)
  expansions.ExpandOptions (interface)
  expansions.offset (function)
  expansions.OffsetOptions (interface)

## extrusions — `api-extrusions.md`

extrusions (namespace) [13 members]
  extrusions.extrudeFromSlices (function)
  extrusions.ExtrudeFromSlicesOptions (interface)
  extrusions.extrudeLinear (function)
  extrusions.ExtrudeLinearOptions (interface)
  extrusions.extrudeRectangular (function)
  extrusions.ExtrudeRectangularOptions (interface)
  extrusions.extrudeRotate (function)
  extrusions.ExtrudeRotateOptions (interface)
  extrusions.extrudeHelical (function)
  extrusions.ExtrudeHelicalOptions (interface)
  extrusions.project (function)
  extrusions.ProjectOptions (interface)
  extrusions.slice (namespace)

## hulls — `api-hulls.md`

hulls (namespace) [4 members]
  hulls.hull (function)
  hulls.hullChain (function)
  hulls.hullPoints2 (function)
  hulls.hullPoints3 (function)

## minkowski — `api-minkowski.md`

minkowski (namespace) [1 members]
  minkowski.minkowskiSum (function)

## modifiers — `api-modifiers.md`

modifiers (namespace) [1 members]
  modifiers.retessellate (function)

## transforms — `api-transforms.md`

transforms (namespace) [26 members]
  transforms.align (function)
  transforms.AlignOptions (interface)
  transforms.center (function)
  transforms.centerX (function)
  transforms.centerY (function)
  transforms.centerZ (function)
  transforms.CenterOptions (interface)
  transforms.mirror (function)
  transforms.mirrorX (function)
  transforms.mirrorY (function)
  transforms.mirrorZ (function)
  transforms.MirrorOptions (interface)
  transforms.rotate (function)
  transforms.rotateX (function)
  transforms.rotateY (function)
  transforms.rotateZ (function)
  transforms.scale (function)
  transforms.scaleX (function)
  transforms.scaleY (function)
  transforms.scaleZ (function)
  transforms.transform (function)
  transforms.translate (function)
  transforms.translateX (function)
  transforms.translateY (function)
  transforms.translateZ (function)
  transforms.Vec (type)
