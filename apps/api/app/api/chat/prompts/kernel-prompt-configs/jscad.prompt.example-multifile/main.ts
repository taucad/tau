import type { geometries } from '@jscad/modeling';
import { makeWidget } from './lib/widget.js';

export default function main(): geometries.geom3.Geom3 {
  return makeWidget();
}
