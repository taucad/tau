# @jscad/modeling — transforms

1 top-level symbols. Signatures are verbatim typescript.

transforms

  // transforms.align (function)
  declare function align<T extends Geometry>(options: AlignOptions, geometry: T): T
  declare function align<T extends Geometry>(options: AlignOptions, ...geometries: RecursiveArray<T>): Array<T>
  declare function align(options: AlignOptions, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  AlignOptions: export interface AlignOptions

    modes?: Array<'center' | 'max' | 'min' | 'none'>

    relativeTo?: [NullableNumber] | [NullableNumber, NullableNumber] | [NullableNumber, NullableNumber, NullableNumber]

    grouped?: boolean

  // transforms.center (function)
  export function center<T extends Geometry>(options: CenterOptions, geometry: T): T
  export function center<T extends Geometry>(options: CenterOptions, ...geometries: RecursiveArray<T>): Array<T>
  export function center(options: CenterOptions, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.centerX (function)
  export function centerX<T extends Geometry>(geometry: T): T
  export function centerX<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function centerX(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.centerY (function)
  export function centerY<T extends Geometry>(geometry: T): T
  export function centerY<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function centerY(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.centerZ (function)
  export function centerZ<T extends Geometry>(geometry: T): T
  export function centerZ<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function centerZ(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  CenterOptions: export interface CenterOptions

    axes?: [boolean, boolean, boolean]

    relativeTo?: Vec3

  // transforms.mirror (function)
  export function mirror<T extends Geometry>(options: MirrorOptions, geometry: T): T
  export function mirror<T extends Geometry>(options: MirrorOptions, ...geometries: RecursiveArray<T>): Array<T>
  export function mirror(options: MirrorOptions, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.mirrorX (function)
  export function mirrorX<T extends Geometry>(geometry: T): T
  export function mirrorX<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function mirrorX(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.mirrorY (function)
  export function mirrorY<T extends Geometry>(geometry: T): T
  export function mirrorY<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function mirrorY(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.mirrorZ (function)
  export function mirrorZ<T extends Geometry>(geometry: T): T
  export function mirrorZ<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function mirrorZ(...geometries: RecursiveArray<Geometry>): Array<Geometry>

  MirrorOptions: export interface MirrorOptions

    origin?: Vec3

    normal?: Vec3

  // transforms.rotate (function)
  export function rotate<T extends Geometry>(angles: Vec1 | Vec2 | Vec3, geometry: T): T
  export function rotate<T extends Geometry>(angles: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<T>): Array<T>
  export function rotate(angles: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.rotateX (function)
  export function rotateX<T extends Geometry>(angle: number, geometry: T): T
  export function rotateX<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateX(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.rotateY (function)
  export function rotateY<T extends Geometry>(angle: number, geometry: T): T
  export function rotateY<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateY(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.rotateZ (function)
  export function rotateZ<T extends Geometry>(angle: number, geometry: T): T
  export function rotateZ<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateZ(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.scale (function)
  export function scale<T extends Geometry>(factors: Vec1 | Vec2 | Vec3, geometry: T): T
  export function scale<T extends Geometry>(factors: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<T>): Array<T>
  export function scale(factors: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.scaleX (function)
  export function scaleX<T extends Geometry>(factor: number, geometry: T): T
  export function scaleX<T extends Geometry>(factor: number, ...geometries: RecursiveArray<T>): Array<T>
  export function scaleX(factor: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.scaleY (function)
  export function scaleY<T extends Geometry>(factor: number, geometry: T): T
  export function scaleY<T extends Geometry>(factor: number, ...geometries: RecursiveArray<T>): Array<T>
  export function scaleY(factor: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.scaleZ (function)
  export function scaleZ<T extends Geometry>(factor: number, geometry: T): T
  export function scaleZ<T extends Geometry>(factor: number, ...geometries: RecursiveArray<T>): Array<T>
  export function scaleZ(factor: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.transform (function)
  export function transform<T extends Geometry>(matrix: Mat4, geometry: T): T
  export function transform<T extends Geometry>(matrix: Mat4, ...geometries: RecursiveArray<T>): Array<T>
  export function transform(matrix: Mat4, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.translate (function)
  export function translate<T extends Geometry>(offset: Vec, geometry: T): T
  export function translate<T extends Geometry>(offset: Vec, ...geometries: RecursiveArray<T>): Array<T>
  export function translate(offset: Vec, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.translateX (function)
  export function translateX<T extends Geometry>(offset: number, geometry: T): T
  export function translateX<T extends Geometry>(offset: number, ...geometries: RecursiveArray<T>): Array<T>
  export function translateX(offset: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.translateY (function)
  export function translateY<T extends Geometry>(offset: number, geometry: T): T
  export function translateY<T extends Geometry>(offset: number, ...geometries: RecursiveArray<T>): Array<T>
  export function translateY(offset: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  // transforms.translateZ (function)
  export function translateZ<T extends Geometry>(offset: number, geometry: T): T
  export function translateZ<T extends Geometry>(offset: number, ...geometries: RecursiveArray<T>): Array<T>
  export function translateZ(offset: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>

  Vec: Vec1 | Vec2 | Vec3
