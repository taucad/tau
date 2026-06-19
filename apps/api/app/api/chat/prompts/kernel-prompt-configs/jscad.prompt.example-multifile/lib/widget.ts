import { primitives, type geometries } from '@jscad/modeling';

const named = <T extends object>(shape: T, name: string): T => Object.assign(shape, { name });

export const makeWidget = (): geometries.geom3.Geom3 => named(primitives.cube({ size: 10 }), 'Widget');
