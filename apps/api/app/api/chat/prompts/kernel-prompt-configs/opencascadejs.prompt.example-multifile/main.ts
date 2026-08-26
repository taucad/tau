import type { TopoDS_Shape } from 'libcascade';
import { makeWidget } from './lib/widget.js';

export default function main(): TopoDS_Shape {
  return makeWidget();
}
