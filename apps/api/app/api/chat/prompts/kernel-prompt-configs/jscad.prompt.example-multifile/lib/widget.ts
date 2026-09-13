import { primitives, type geometries } from '@jscad/modeling';

export const makeWidget = (): geometries.geom3.Geom3 => primitives.cube({ size: 10 });
